module.exports = {
  someSidebar: {
    Optic: [
      'optic/community',
      'optic/demo',
      'optic/get-involved',
      'optic/roadmap',
    ],
    'Get Started': [
      'get-started/quickstart',
      'get-started/config',
      'get-started/testing',
    ],
    'Using Optic': [
      'using/baseline',
      'using/reviewing-diffs',
      'using/share-with-team',
    ],
    'API Ops': ['apiops/pull-requests', 'apiops/openapi', 'apiops/scripts'],
    Integrations: [
      'integrations/integrations',
      {
        type: 'category',
        label: 'API Frameworks',
        items: [
          'integrations/frameworks/actix',
          'integrations/frameworks/c-sharp',
          'integrations/frameworks/cpp',
          'integrations/frameworks/django',
          'integrations/frameworks/elixir',
          'integrations/frameworks/express',
          'integrations/frameworks/fastapi',
          'integrations/frameworks/flask',
          'integrations/frameworks/gorilla',
          'integrations/frameworks/hapi',
          'integrations/frameworks/laravel',
          'integrations/frameworks/pistache',
          'integrations/frameworks/puma',
          'integrations/frameworks/rocket-ignite',
          'integrations/frameworks/rocket',
          'integrations/frameworks/ruby-on-rails',
          'integrations/frameworks/sails',
          'integrations/frameworks/spring',
        ],
      },
      // {
      //   type: 'category',
      //   label: 'CI/CD Pipelines',
      //   items: ['integrations/cicd/github-actions', 'integrations/cicd/circleci'],
      // },
    ],
  },
};
