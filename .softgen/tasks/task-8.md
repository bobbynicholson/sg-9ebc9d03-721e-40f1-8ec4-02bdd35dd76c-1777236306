---
title: Index front end pages when built
status: todo
created_by: human
created_at: '2026-04-25T14:15:40.988036'
position: 6
priority: low
type: idea
---

## Notes
When you're ready to make the frontend public:

Remove <NoIndexMeta /> from _app.tsx
Remove meta tags from _document.tsx
Update robots.txt to only block backend routes: ```txt User-agent: Disallow: /admin/ Disallow: /super-admin/ Disallow: /team-portal/ Disallow: /client-portal/ Disallow: /account/ Disallow: /auth/ Disallow: /api/ Disallow: //admin/ Disallow: /*/login
Allow: / Allow: /pricing Allow: /features Allow: /blog/
