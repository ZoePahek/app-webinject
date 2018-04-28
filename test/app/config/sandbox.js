'use strict';

var contextPath = '/webinject-example';

module.exports = {
  application: {
    contextPath: contextPath
  },
  plugins: {
    appWebinject: {
      contextPath: contextPath,
      interceptor: 'tamper'
    },
    appWebweaver: {
      defaultRedirectUrl: contextPath + '/index'
    }
  }
};
