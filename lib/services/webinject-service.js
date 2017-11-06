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

      var headTags = { prefix: {}, suffix: {} };
      var bodyTags = { prefix: {}, suffix: {} };

      lodash.assign(headTags.prefix, webComponent.headPrefixTags);
      lodash.assign(headTags.suffix, webComponent.headSuffixTags);
      lodash.assign(bodyTags.prefix, webComponent.bodyPrefixTags);
      lodash.assign(bodyTags.suffix, webComponent.bodySuffixTags);

      debugx.enabled && debugx('headTags: %s', JSON.stringify(headTags, null, 2));
      debugx.enabled && debugx('bodyTags: %s', JSON.stringify(bodyTags, null, 2));

      var headPrefixLines = lodash.flatten(lodash.map(lodash.values(headTags.prefix), 'text'));
      var headSuffixLines = lodash.flatten(lodash.map(lodash.values(headTags.suffix), 'text'));
      var bodyPrefixLines = lodash.flatten(lodash.map(lodash.values(bodyTags.prefix), 'text'));
      var bodySuffixLines = lodash.flatten(lodash.map(lodash.values(bodyTags.suffix), 'text'));

      debugx.enabled && debugx('headPrefixLines: %s', JSON.stringify(headPrefixLines, null, 2));
      debugx.enabled && debugx('headSuffixLines: %s', JSON.stringify(headSuffixLines, null, 2));
      debugx.enabled && debugx('bodyPrefixLines: %s', JSON.stringify(bodyPrefixLines, null, 2));
      debugx.enabled && debugx('bodySuffixLines: %s', JSON.stringify(bodySuffixLines, null, 2));

      if (!lodash.isEmpty(headPrefixLines)) {
        interceptRule.headPrefixCode = headPrefixLines.join('\n');
      }
      if (!lodash.isEmpty(headSuffixLines)) {
        interceptRule.headSuffixCode = headSuffixLines.join('\n');
      }
      if (!lodash.isEmpty(bodyPrefixLines)) {
        interceptRule.bodyPrefixCode = bodyPrefixLines.join('\n');
      }
      if (!lodash.isEmpty(bodySuffixLines)) {
        interceptRule.bodySuffixCode = bodySuffixLines.join('\n');
      }
    }
    interceptRules = lodash.values(interceptMap);
  };

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
                if (rule.interceptTest && rule.interceptTest.exec(reqUrl)) {
                  rule.headPrefixCode && $document('head').prepend(rule.headPrefixCode);
                  rule.headSuffixCode && $document('head').append(rule.headSuffixCode);
                  rule.bodyPrefixCode && $document('body').prepend(rule.bodyPrefixCode);
                  rule.bodySuffixCode && $document('body').append(rule.bodySuffixCode);
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
                  if (rule.interceptTest && rule.interceptTest.exec(reqUrl)) {
                    rule.headPrefixCode && $document('head').prepend(rule.headPrefixCode);
                    rule.headSuffixCode && $document('head').append(rule.headSuffixCode);
                    rule.bodyPrefixCode && $document('body').prepend(rule.bodyPrefixCode);
                    rule.bodySuffixCode && $document('body').append(rule.bodySuffixCode);
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
