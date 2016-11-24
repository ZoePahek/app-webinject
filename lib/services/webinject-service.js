'use strict';

var events = require('events');
var util = require('util');
var fs = require('fs');
var path = require('path');

var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var lodash = Devebot.require('lodash');
var debug = Devebot.require('debug');
var debuglog = debug('appWebinject:service');

var cheerio = require('cheerio');
var interceptor = require('express-interceptor');
var tamper = require('tamper');

var Service = function(params) {
  debuglog.isEnabled && debuglog(', constructor begin ...');

  params = params || {};

  var self = this;

  self.logger = params.loggingFactory.getLogger();

  self.getSandboxName = function() {
    return params.sandboxName;
  };

  var pluginCfg = lodash.get(params, ['sandboxConfig', 'plugins', 'appWebinject'], {});
  debuglog.isEnabled && debuglog(' - appWebinject config: %s', JSON.stringify(pluginCfg));
  var contextPath = pluginCfg.contextPath || '/webinject';

  var webcomponents = [];

  self.enqueue = function(webcomponent) {
    if (lodash.isObject(webcomponent) && !lodash.isEmpty(webcomponent)) {
      debuglog.isEnabled && debuglog(' - enqueue new web component: %s', JSON.stringify(lodash.keys(webcomponent)));
      webcomponents.push(webcomponent);
    }
  };

  self.buildInjectorRouter = function(express) {
    var interceptUrls = [];
    var headInjectedTags = { prefix: {}, suffix: {} };
    var bodyInjectedTags = { prefix: {}, suffix: {} };

    debuglog.isEnabled && debuglog('webcomponents', JSON.stringify(webcomponents, null, 2));

    lodash.forEach(webcomponents, function(webcomponent) {
      if (lodash.isArray(webcomponent.interceptUrls)) {
        interceptUrls = lodash.union(interceptUrls, webcomponent.interceptUrls);
      }
      lodash.assign(headInjectedTags.suffix, webcomponent.headSuffixTags);
      lodash.assign(bodyInjectedTags.suffix, webcomponent.bodySuffixTags);
    });

    debuglog.isEnabled && debuglog('headInjectedTags', JSON.stringify(headInjectedTags, null, 2));
    debuglog.isEnabled && debuglog('bodyInjectedTags', JSON.stringify(bodyInjectedTags, null, 2));

    var headInjectedCode = lodash.flatten(lodash.map(lodash.values(headInjectedTags.suffix), 'text'));
    var bodyInjectedCode = lodash.flatten(lodash.map(lodash.values(bodyInjectedTags.suffix), 'text'));

    debuglog.isEnabled && debuglog('headInjectedCode', JSON.stringify(headInjectedCode, null, 2));
    debuglog.isEnabled && debuglog('bodyInjectedCode', JSON.stringify(bodyInjectedCode, null, 2));

    headInjectedCode = headInjectedCode.join('\n');
    bodyInjectedCode = bodyInjectedCode.join('\n');

    var router = express.Router();

    if (debuglog.isEnabled) {
      router.all(interceptUrls, function(req, res, next) {
        debuglog.isEnabled && debuglog(' - before intercepting');
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

    if (debuglog.isEnabled) {
      router.all(interceptUrls, function(req, res, next) {
        debuglog.isEnabled && debuglog(' - after intercepting');
        next();
      });
    }

    return router;
  }

  self.getServiceInfo = function() {
    return {};
  };

  self.getServiceHelp = function() {
    return {};
  };

  debuglog.isEnabled && debuglog(' - constructor end!');
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
    "generalConfig": {
      "type": "object"
    },
    "loggingFactory": {
      "type": "object"
    },
    "webserverTrigger": {
      "type": "object"
    }
  }
};

module.exports = Service;
