'use strict';

var events = require('events');
var util = require('util');
var fs = require('fs');
var path = require('path');

var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var lodash = Devebot.require('lodash');
var debug = Devebot.require('debug');
var debugx = debug('appWebinject:service');

var cheerio = require('cheerio');
var interceptor = require('express-interceptor');
var tamper = require('tamper');

var Service = function(params) {
  debugx.enabled && debugx(', constructor begin ...');

  params = params || {};

  var self = this;

  self.logger = params.loggingFactory.getLogger();

  self.getSandboxName = function() {
    return params.sandboxName;
  };

  var pluginCfg = lodash.get(params, ['sandboxConfig', 'plugins', 'appWebinject'], {});
  debugx.enabled && debugx(' - appWebinject config: %s', JSON.stringify(pluginCfg));
  var contextPath = pluginCfg.contextPath || '/webinject';
  var express = params.webweaverService.express;

  var webcomponents = [];

  self.enqueue = function(webcomponent) {
    if (lodash.isObject(webcomponent) && !lodash.isEmpty(webcomponent)) {
      debugx.enabled && debugx(' - enqueue new web component: %s', JSON.stringify(lodash.keys(webcomponent)));
      webcomponents.push(webcomponent);
    }
  };

  self.buildInjectorRouter = function(express) {
    var interceptUrls = [];
    var headInjectedTags = { prefix: {}, suffix: {} };
    var bodyInjectedTags = { prefix: {}, suffix: {} };

    debugx.enabled && debugx('webcomponents', JSON.stringify(webcomponents, null, 2));

    lodash.forEach(webcomponents, function(webcomponent) {
      if (lodash.isArray(webcomponent.interceptUrls)) {
        interceptUrls = lodash.union(interceptUrls, webcomponent.interceptUrls);
      }
      lodash.assign(headInjectedTags.suffix, webcomponent.headSuffixTags);
      lodash.assign(bodyInjectedTags.suffix, webcomponent.bodySuffixTags);
    });

    debugx.enabled && debugx('headInjectedTags', JSON.stringify(headInjectedTags, null, 2));
    debugx.enabled && debugx('bodyInjectedTags', JSON.stringify(bodyInjectedTags, null, 2));

    var headInjectedCode = lodash.flatten(lodash.map(lodash.values(headInjectedTags.suffix), 'text'));
    var bodyInjectedCode = lodash.flatten(lodash.map(lodash.values(bodyInjectedTags.suffix), 'text'));

    debugx.enabled && debugx('headInjectedCode', JSON.stringify(headInjectedCode, null, 2));
    debugx.enabled && debugx('bodyInjectedCode', JSON.stringify(bodyInjectedCode, null, 2));

    headInjectedCode = headInjectedCode.join('\n');
    bodyInjectedCode = bodyInjectedCode.join('\n');

    var router = express.Router();

    if (debugx.enabled) {
      router.all(interceptUrls, function(req, res, next) {
        debugx.enabled && debugx(' - before intercepting');
        next();
      });
    }

    if (pluginCfg.interceptor == 'tamper') {
      router.use(interceptUrls, tamper(function(req, res) {
        if (!/text\/html/.test(res.get('Content-Type'))) return;
        return function(body) {
          var $document = cheerio.load(body, {
              ignoreWhitespace: false,
              decodeEntities: false
          });
          $document('head').append(headInjectedCode);
          $document('body').append(bodyInjectedCode);
          return $document.html();
        }
      }));
    } else {
      router.use(interceptUrls, interceptor(function(req, res) {
        return {
          isInterceptable: function(){
            return /text\/html/.test(res.get('Content-Type'));
          },
          intercept: function(body, send) {
            var $document = cheerio.load(body);
            $document('head').append(headInjectedCode);
            $document('body').append(bodyInjectedCode);
            send($document.html());
          }
        };
      }));
    }

    if (debugx.enabled) {
      router.all(interceptUrls, function(req, res, next) {
        debugx.enabled && debugx(' - after intercepting');
        next();
      });
    }

    return router;
  }

  var childRack = null;
  if (pluginCfg.autowired !== false) {
    childRack = childRack || {
      name: 'app-webinject-branches',
      middleware: express()
    };
    params.webweaverService.push([
      {
        name: 'app-webinject-router',
        middleware: self.buildInjectorRouter(express)
      },
      childRack
    ], pluginCfg.priority);
  }

  self.inject = self.push = function(layerOrBranches) {
    if (childRack) {
      debugx.enabled && debugx(' - inject layerOrBranches');
      params.webweaverService.wire(childRack.middleware, layerOrBranches, childRack.trails);
    }
  }

  debugx.enabled && debugx(' - constructor end!');
};

Service.argumentSchema = {
  "id": "webinjectService",
  "type": "object",
  "properties": {
    "sandboxName": {
      "type": "string"
    },
    "sandboxConfig": {
      "type": "object"
    },
    "profileConfig": {
      "type": "object"
    },
    "loggingFactory": {
      "type": "object"
    },
    "webweaverService": {
      "type": "object"
    }
  }
};

module.exports = Service;
