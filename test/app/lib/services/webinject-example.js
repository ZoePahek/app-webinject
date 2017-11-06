'use strict';

var events = require('events');
var util = require('util');
var fs = require('fs');
var path = require('path');
var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var lodash = Devebot.require('lodash');
var debug = Devebot.require('debug');
var debuglog = debug('appWebinject:example');

var Service = function(params) {
  debuglog.isEnabled && debuglog(' + constructor begin ...');

  params = params || {};
  var self = this;

  var pluginCfg = params.sandboxConfig;
  var contextPath = pluginCfg.contextPath || '/webinject';
  var express = params.webweaverService.express;

  params.webinjectService.enqueue({
    interceptUrls: [contextPath + '/index(.*)'],
    bodySuffixTags: {
      sidebarStyle: {
        type: 'script',
        text: [
          util.format("<script src='%s/js/code.js'></script>", contextPath)
        ]
      }
    }
  });

  params.webinjectService.enqueue({
    interceptUrls: [contextPath + '/index', contextPath + '/index1.html'],
    headSuffixTags: {
      sidebarStyle: {
        type: 'css',
        text: [
          util.format("<link href='%s/css/style1.css' rel='stylesheet' type='text/css'/>", contextPath)
        ]
      }
    }
  });

  params.webinjectService.enqueue({
    interceptUrls: [contextPath + '/index', contextPath + '/index2.html'],
    headSuffixTags: {
      sidebarStyle: {
        type: 'css',
        text: [
          util.format("<link href='%s/css/style2.css' rel='stylesheet' type='text/css'/>", contextPath)
        ]
      }
    }
  });

  var router = new express();
  router.set('views', __dirname + '/../../views');
  router.set('view engine', 'ejs');
  router.route('/index').get(function(req, res, next) {
    res.render('index', {});
  });

  params.webinjectService.inject([{
    name: 'app-webinject-example-public',
    path: contextPath,
    middleware: express.static(path.join(__dirname, '../../public'))
  }, {
    name: 'app-webinject-example-router',
    path: contextPath,
    middleware: router
  }]);

  debuglog.isEnabled && debuglog(' - constructor end!');
};

Service.argumentSchema = {
  "id": "webinjectExample",
  "type": "object",
  "properties": {
    "webinjectService": {
      "type": "object"
    },
    "webweaverService": {
      "type": "object"
    }
  }
};

module.exports = Service;
