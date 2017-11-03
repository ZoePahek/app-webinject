module.exports = {
  plugins: {
    appWebinject: {
      contextPath: '/webinject-bdd',
      interceptor: 'tamper'
    },
    appWebweaver: {
      defaultRedirectUrl: '/webinject-bdd/index'
    }
  }
};
