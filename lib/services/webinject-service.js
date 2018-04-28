'use strict';

var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var chores = Devebot.require('chores');
var lodash = Devebot.require('lodash');
var pathToRegexp = require('path-to-regexp');
var cheerio = require('cheerio');
var interceptor = require('express-interceptor');
var tamper = require('tamper');

var Service = function(params) {
  params = params || {};
  var self = this;

  var LX = params.loggingFactory.getLogger();
  var LT = params.loggingFactory.getTracer();
  var packageName = params.packageName || 'app-webinject';
  var blockRef = chores.getBlockRef(__filename, packageName);

  LX.has('silly') && LX.log('silly', LT.toMessage({
    tags: [ blockRef, 'constructor-begin' ],
    text: ' + constructor begin ...'
  }));

  var pluginCfg = params.sandboxConfig;
  var contextPath = pluginCfg.contextPath || '/webinject';
  var express = params.webweaverService.express;

  var interceptUrls = [];
  var interceptTest = null;
  var interceptMap = {};
  var interceptRules = [];

  self.enqueue = function(webComponent) {
    if (!lodash.isObject(webComponent) || lodash.isEmpty(webComponent)) {
      return;
    }
    LX.has('silly') && LX.log('silly', ' - register a component: %s', JSON.stringify(lodash.keys(webComponent)));

    if (lodash.isArray(webComponent.interceptUrls)) {
      interceptUrls = lodash.union(interceptUrls, webComponent.interceptUrls);
    }
    LX.has('silly') && LX.log('silly', 'interceptUrls: %s', JSON.stringify(interceptUrls));
    if (!lodash.isEmpty(interceptUrls)) interceptTest = pathToRegexp(interceptUrls);

    webComponent.id = webComponent.id || chores.getUUID();
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

      LX.has('silly') && LX.log('silly', 'headTags: %s', JSON.stringify(headTags, null, 2));
      LX.has('silly') && LX.log('silly', 'bodyTags: %s', JSON.stringify(bodyTags, null, 2));

      var headPrefixLines = lodash.flatten(lodash.map(lodash.values(headTags.prefix), 'text'));
      var headSuffixLines = lodash.flatten(lodash.map(lodash.values(headTags.suffix), 'text'));
      var bodyPrefixLines = lodash.flatten(lodash.map(lodash.values(bodyTags.prefix), 'text'));
      var bodySuffixLines = lodash.flatten(lodash.map(lodash.values(bodyTags.suffix), 'text'));

      LX.has('silly') && LX.log('silly', 'headPrefixLines: %s', JSON.stringify(headPrefixLines, null, 2));
      LX.has('silly') && LX.log('silly', 'headSuffixLines: %s', JSON.stringify(headSuffixLines, null, 2));
      LX.has('silly') && LX.log('silly', 'bodyPrefixLines: %s', JSON.stringify(bodyPrefixLines, null, 2));
      LX.has('silly') && LX.log('silly', 'bodySuffixLines: %s', JSON.stringify(bodySuffixLines, null, 2));

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
        LX.has('silly') && LX.log('silly', ' - before intercepting: %s', reqUrl);
        if (pluginCfg.interceptor == 'tamper') {
          return tamper(function(req, res) {
            LX.has('silly') && LX.log('silly', ' - request is intercepted');
            return function(body) {
              if (!/text\/html/.test(res.get('Content-Type'))) return body;
              var $document = cheerio.load(body, {
                  ignoreWhitespace: false,
                  decodeEntities: false
              });
              lodash.forEach(interceptRules, function(rule) {
                LX.has('silly') && LX.log('silly', ' - request is intercepted: %s ~ %s', reqUrl,
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
                LX.has('silly') && LX.log('silly', ' - req is intercepted');
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
        LX.has('silly') && LX.log('silly', ' - after intercepting: %s', req.url);
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

  self.fork = function(layerOrBranches) {
    if (childRack) {
      LX.has('silly') && LX.log('silly', ' - inject layerOrBranches');
      params.webweaverService.wire(childRack.middleware, layerOrBranches, childRack.trails);
    }
  }

  self.push = function(layerOrBranches, priority) {
    priority = (typeof(priority) === 'number') ? priority : pluginCfg.priority;
    params.webweaverService.push(layerOrBranches, priority);
  }

  // Deprecated
  self.inject = self.fork;

  LX.has('silly') && LX.log('silly', LT.toMessage({
    tags: [ blockRef, 'constructor-end' ],
    text: ' - constructor end!'
  }));
};

Service.referenceList = [ "webweaverService" ];

module.exports = Service;
