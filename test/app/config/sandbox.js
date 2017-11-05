var contextPath = '/webinject-bdd';

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
