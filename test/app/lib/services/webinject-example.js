'use strict';

var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var lodash = Devebot.require('lodash');
var debugx = Devebot.require('pinbug')('app-webinject:example');
var fs = require('fs');
var path = require('path');
var util = require('util');

var Service = function(params) {
  debugx.enabled && debugx(' + constructor begin ...');

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

  debugx.enabled && debugx(' - constructor end!');
};

Service.referenceList = ["webinjectService", "webweaverService"];

module.exports = Service;
