async function install(page) {
  await page.addInitScript(() => {
    localStorage.setItem('octos_session_token', 'curated-course-e2e');
    localStorage.setItem('selected_profile', 'curated-learner');
    localStorage.setItem('octos-learn:setup-skipped:curated-learner', 'yes');
  });
  await page.routeWebSocket((url) => url.pathname.startsWith('/api/'), (socket) => socket.close());
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.startsWith('/api/learn/course-packs')) return route.continue();
    const responses = {
      '/api/auth/status': { bootstrap_mode: false, email_login_enabled: true },
      '/api/auth/me': { user: { id: 'curated-learner', email: 'l@e.t', name: 'L' }, portal: { accessible_profiles: [{ id: 'curated-learner', name: 'L' }], home_profile_id: 'curated-learner', can_access_admin_portal: false } },
      '/api/my/profile': { id: 'curated-learner', name: 'L', config: { llm: { primary: { family_id: '', model_id: '' } } } },
    };
    await route.fulfill({ status: pathname in responses ? 200 : 503, contentType: 'application/json', body: JSON.stringify(responses[pathname] ?? {}) });
  });
}


module.exports={install};
