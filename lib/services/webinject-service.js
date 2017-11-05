'use strict';

var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var lodash = Devebot.require('lodash');
var debugx = Devebot.require('debug')('appWebinject:service');
var pathToRegexp = require('path-to-regexp');
var cheerio = require('cheerio');
var interceptor = require('express-interceptor');
var tamper = require('tamper');
var uuid = require('uuid');

var Service = function(params) {
  debugx.enabled && debugx(' - constructor begin ...');

  params = params || {};
  var self = this;

  var pluginCfg = params.sandboxConfig;
  var contextPath = pluginCfg.contextPath || '/webinject';
  var express = params.webweaverService.express;
  var logger = params.loggingFactory.getLogger();

  var interceptUrls = [];
  var interceptTest = null;
  var interceptMap = {};
  var interceptRules = [];
  var webComponents = [];

  self.enqueue = function(webComponent) {
    if (!lodash.isObject(webComponent) || lodash.isEmpty(webComponent)) {
      return;
    }
    debugx.enabled && debugx(' - register a component: %s', JSON.stringify(lodash.keys(webComponent)));
    webComponents.push(webComponent);

    if (lodash.isArray(webComponent.interceptUrls)) {
      interceptUrls = lodash.union(interceptUrls, webComponent.interceptUrls);
    }
    debugx.enabled && debugx('interceptUrls: %s', JSON.stringify(interceptUrls));
    if (!lodash.isEmpty(interceptUrls)) interceptTest = pathToRegexp(interceptUrls);

    webComponent.id = webComponent.id || uuid.v4();
    if (!interceptMap[webComponent.id]) {
      var interceptRule = interceptMap[webComponent.id] = {};
      interceptRule.interceptUrls = webComponent.interceptUrls;
      if (!lodash.isEmpty(interceptRule.interceptUrls)) {
        interceptRule.interceptTest = pathToRegexp(interceptRule.interceptUrls);
      }

      var headInjectedTags = { prefix: {}, suffix: {} };
      var bodyInjectedTags = { prefix: {}, suffix: {} };

      lodash.assign(headInjectedTags.suffix, webComponent.headSuffixTags);
      lodash.assign(bodyInjectedTags.suffix, webComponent.bodySuffixTags);

      debugx.enabled && debugx('headInjectedTags: %s', JSON.stringify(headInjectedTags, null, 2));
      debugx.enabled && debugx('bodyInjectedTags: %s', JSON.stringify(bodyInjectedTags, null, 2));

      var headInjectedLines = lodash.flatten(lodash.map(lodash.values(headInjectedTags.suffix), 'text'));
      var bodyInjectedLines = lodash.flatten(lodash.map(lodash.values(bodyInjectedTags.suffix), 'text'));

      debugx.enabled && debugx('headInjectedLines: %s', JSON.stringify(headInjectedLines, null, 2));
      debugx.enabled && debugx('bodyInjectedLines: %s', JSON.stringify(bodyInjectedLines, null, 2));

      if (!lodash.isEmpty(headInjectedLines)) {
        interceptRule.headInjectedCode = headInjectedLines.join('\n');
      }
      if (!lodash.isEmpty(bodyInjectedLines)) {
        interceptRule.bodyInjectedCode = bodyInjectedLines.join('\n');
      }
    }
    interceptRules = lodash.values(interceptMap);
  };

  var isNotEmpty = function(rule) {
    return (rule.headInjectedCode || rule.bodyInjectedCode);
  }

  self.buildInjectorRouter = function(express) {
    return function(req, res, next) {
      var reqUrl = req.url;
      if (interceptTest && interceptTest.exec(reqUrl)) {
        debugx.enabled && debugx(' - before intercepting: %s', reqUrl);
        if (pluginCfg.interceptor == 'tamper') {
          return tamper(function(req, res) {
            debugx.enabled && debugx(' - request is intercepted');
            return function(body) {
              if (!/text\/html/.test(res.get('Content-Type'))) return body;
              var $document = cheerio.load(body, {
                  ignoreWhitespace: false,
                  decodeEntities: false
              });
              lodash.forEach(interceptRules, function(rule) {
                debugx.enabled && debugx(' - request is intercepted: %s ~ %s', reqUrl,
                  JSON.stringify(rule.interceptUrls));
                if (rule.interceptTest && rule.interceptTest.exec(reqUrl) && isNotEmpty(rule)) {
                  rule.headInjectedCode && $document('head').append(rule.headInjectedCode);
                  rule.bodyInjectedCode && $document('body').append(rule.bodyInjectedCode);
                }
              });
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
                lodash.forEach(interceptRules, function(rule) {
                  if (rule.interceptTest && rule.interceptTest.exec(reqUrl) && isNotEmpty(rule)) {
                    rule.headInjectedCode && $document('head').append(rule.headInjectedCode);
                    rule.bodyInjectedCode && $document('body').append(rule.bodyInjectedCode);
                  }
                });
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
    "webweaverService": {
      "type": "object"
    }
  }
};

module.exports = Service;
