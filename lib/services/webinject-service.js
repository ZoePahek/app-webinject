'use strict';

var events = require('events');
var util = require('util');
var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var lodash = Devebot.require('lodash');
var debugx = Devebot.require('debug')('appWebinject:service');
var pathToRegexp = require('path-to-regexp');
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

  var webComponents = [];

  self.enqueue = function(webComponent) {
    if (lodash.isObject(webComponent) && !lodash.isEmpty(webComponent)) {
      debugx.enabled && debugx(' - register a component: %s', JSON.stringify(lodash.keys(webComponent)));
      webComponents.push(webComponent);
      rebuild();
    }
  };

  var interceptUrls = [];
  var headInjectedCode = null;
  var bodyInjectedCode = null;
  var interceptTest = null;

  var rebuild = function() {
    var headInjectedTags = { prefix: {}, suffix: {} };
    var bodyInjectedTags = { prefix: {}, suffix: {} };

    debugx.enabled && debugx('webComponents: %s', JSON.stringify(webComponents, null, 2));

    interceptUrls = [];
    lodash.forEach(webComponents, function(webComponent) {
      if (lodash.isArray(webComponent.interceptUrls)) {
        interceptUrls = lodash.union(interceptUrls, webComponent.interceptUrls);
      }
      lodash.assign(headInjectedTags.suffix, webComponent.headSuffixTags);
      lodash.assign(bodyInjectedTags.suffix, webComponent.bodySuffixTags);
    });

    debugx.enabled && debugx('interceptUrls: %s', JSON.stringify(interceptUrls));
    if (!lodash.isEmpty(interceptUrls)) {
      interceptTest = pathToRegexp(interceptUrls);
    }

    debugx.enabled && debugx('headInjectedTags: %s', JSON.stringify(headInjectedTags, null, 2));
    debugx.enabled && debugx('bodyInjectedTags: %s', JSON.stringify(bodyInjectedTags, null, 2));

    var headInjectedLines = lodash.flatten(lodash.map(lodash.values(headInjectedTags.suffix), 'text'));
    var bodyInjectedLines = lodash.flatten(lodash.map(lodash.values(bodyInjectedTags.suffix), 'text'));

    debugx.enabled && debugx('headInjectedLines: %s', JSON.stringify(headInjectedLines, null, 2));
    debugx.enabled && debugx('bodyInjectedLines: %s', JSON.stringify(bodyInjectedLines, null, 2));

    if (!lodash.isEmpty(headInjectedLines)) {
      headInjectedCode = headInjectedLines.join('\n');
    }
    if (!lodash.isEmpty(bodyInjectedLines)) {
      bodyInjectedCode = bodyInjectedLines.join('\n');
    }
  }

  var checkContentNotEmpty = function() {
    return (headInjectedCode || bodyInjectedCode);
  }

  var checkHeadNotEmpty = function() {
    return headInjectedCode !== null;
  }

  var checkBodyNotEmpty = function() {
    return bodyInjectedCode !== null;
  }

  self.buildInjectorRouter = function(express) {
    return function(req, res, next) {
      if (interceptTest && interceptTest.exec(req.url) && checkContentNotEmpty()) {
        debugx.enabled && debugx(' - before intercepting: %s', req.url);
        if (pluginCfg.interceptor == 'tamper') {
          return tamper(function(req, res) {
            debugx.enabled && debugx(' - request is intercepted');
            return function(body) {
              if (!/text\/html/.test(res.get('Content-Type'))) return body;
              var $document = cheerio.load(body, {
                  ignoreWhitespace: false,
                  decodeEntities: false
              });
              checkHeadNotEmpty() && $document('head').append(headInjectedCode);
              checkBodyNotEmpty() && $document('body').append(bodyInjectedCode);
              return $document.html();
            }
          })(req, res, next);
        } else {
          return interceptor(function(req, res) {
            return {
              isInterceptable: function(){
                return (/text\/html/.test(res.get('Content-Type')));
              },
              intercept: function(body, send) {
                debugx.enabled && debugx(' - req is intercepted');
                var $document = cheerio.load(body);
                checkHeadNotEmpty() && $document('head').append(headInjectedCode);
                checkBodyNotEmpty() && $document('body').append(bodyInjectedCode);
                send($document.html());
              }
            };
          })(req, res, next);
        }
        debugx.enabled && debugx(' - after intercepting: %s', req.url);
      }
      next();
    }
  }

  var childRack = null;
  if (pluginCfg.autowired !== false) {
    params.webweaverService.push([
      {
        name: 'app-webinject-router',
        middleware: self.buildInjectorRouter(express)
      },
      childRack = childRack || {
        name: 'app-webinject-branches',
        middleware: express()
      }
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
