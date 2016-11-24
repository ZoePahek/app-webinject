'use strict';

var events = require('events');
var util = require('util');
var path = require('path');
var Devebot = require('devebot');
var lodash = Devebot.require('lodash');
var debug = Devebot.require('debug');
var debuglog = debug('appWebinject:trailer');

var Service = function(params) {
  debuglog.isEnabled && debuglog(' + constructor begin ...');

  params = params || {};

  var self = this;
  var pluginCfg = lodash.get(params, ['sandboxConfig', 'plugins', 'appWebinject'], {});

  self.logger = params.loggingFactory.getLogger();

  self.getSandboxName = function() {
    return params.sandboxName;
  };

  var webserverTrigger = params.webserverTrigger;
  var express = webserverTrigger.getExpress();
  var position = webserverTrigger.getPosition();

  webserverTrigger.inject(params.webinjectService.buildInjectorRouter(express),
      null, position.inRangeOfStaticFiles(), 'app-webinject-router');

  self.getServiceInfo = function() {
    return {};
  };

  self.getServiceHelp = function() {
    return {};
  };

  debuglog.isEnabled && debuglog(' - constructor end!');
};

Service.argumentSchema = {
  "id": "webinjectTrailer",
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
    "webinjectService": {
      "type": "object"
    },
    "webserverTrigger": {
      "type": "object"
    }
  }
};

module.exports = Service;
