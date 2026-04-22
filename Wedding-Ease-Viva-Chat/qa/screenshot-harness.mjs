#!/usr/bin/env node
/**
 * QA Screenshot Harness — Theme Migration Verification
 * ------------------------------------------------------------------
 * Captures screenshots of every public route at multiple viewports so
 * reviewers can visually confirm the token migration did not alter
 * look & feel. Authenticated routes are flagged separately and require
 * a logged-in session state file (see README.md for how to seed one).
 *
 * Usage:
 *   # 1. Start the dev server in another terminal:
 *   #    npm run dev  (expects http://localhost:8080 by default)
 *   # 2. Run the harness:
 *   #    node qa/screenshot-harness.mjs                    (public routes only)
 *   #    node qa/screenshot-harness.mjs --auth storage.json (auth-required routes)
 *
 * Output:
 *   qa/screenshots/<route>/<viewport>.png
 *   qa/screenshots/_manifest.json
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:8080';
const OUT_DIR  = path.join(process.cwd(), 'qa', 'screenshots');

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900  },
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'mobile-390',   width: 390,  height: 844  },
  { name: 'mobile-360',   width: 360,  height: 800  },
];

// Routes that work without auth — guest-mode friendly.
const PUBLIC_ROUTES = [
  { id: 'home',             path: '/'                    },
  { id: 'pricing',          path: '/pricing'             },
  { id: 'terms',            path: '/terms'               },
  { id: 'privacy',          path: '/privacy'             },
  { id: 'help',             path: '/help'                },
  { id: 'login',            path: '/login'               },
  { id: 'payment-success',  path: '/payment/success'     },
  { id: 'payment-failure',  path: '/payment/failure'     },
  { id: 'not-found',        path: '/this-page-does-not-exist' },
];

// Routes requiring a signed-in session. Supply --auth <storageState.json>.
const AUTH_ROUTES = [
  { id: 'planner',       path: ':uid/planner'        },
  { id: 'gallery',       path: ':uid/gallery'        },
  { id: 'liked',         path: ':uid/liked'          },
  { id: 'reminders',     path: ':uid/reminders'      },
  { id: 'budget',        path: ':uid/budget'         },
  { id: 'shopping',      path: ':uid/shopping'       },
  { id: 'saved-items',   path: ':uid/saved-items'    },
  { id: 'timeline',      path: ':uid/timeline'       },
  { id: 'progress',      path: ':uid/progress'       },
  { id: 'notifications', path: ':uid/notifications'  },
  { id: 'collaborate',   path: ':uid/collaborate'    },
  { id: 'notes',         path: ':uid/notes'          },
  { id: 'checkout',      path: 'checkout?tier=plus'  },
];

async function run() {
  const args = process.argv.slice(2);
  const authIdx = args.indexOf('--auth');
  const storageStatePath = authIdx >= 0 ? args[authIdx + 1] : null;
  const uid = process.env.QA_UID || null;

  const routes = [...PUBLIC_ROUTES];
  if (storageStatePath && uid) {
    for (const r of AUTH_ROUTES) {
      routes.push({ ...r, path: `/${r.path.replace(':uid', uid)}` });
    }
  } else if (storageStatePath || uid) {
    console.warn('[qa] Pass BOTH --auth <file> and QA_UID env to include auth routes.');
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const manifest = { base: BASE_URL, capturedAt: new Date().toISOString(), routes: [] };

  for (const viewport of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      storageState: storageStatePath && path.resolve(storageStatePath),
    });
    const page = await ctx.newPage();

    for (const route of routes) {
      const url = `${BASE_URL}${route.path.startsWith('/') ? route.path : '/' + route.path}`;
      const routeDir = path.join(OUT_DIR, route.id);
      await fs.mkdir(routeDir, { recursive: true });
      const outPath = path.join(routeDir, `${viewport.name}.png`);

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        // Let lazy images / Suspense settle before snapshot.
        await page.waitForTimeout(800);
        await page.screenshot({ path: outPath, fullPage: true });
        manifest.routes.push({ route: route.id, viewport: viewport.name, url, file: path.relative(OUT_DIR, outPath) });
        console.log(`[qa] ✓ ${viewport.name} ${route.id}`);
      } catch (err) {
        console.warn(`[qa] ✗ ${viewport.name} ${route.id} — ${err.message}`);
        manifest.routes.push({ route: route.id, viewport: viewport.name, url, error: err.message });
      }
    }

    await ctx.close();
  }

  await browser.close();
  await fs.writeFile(path.join(OUT_DIR, '_manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`[qa] wrote ${manifest.routes.length} entries → ${OUT_DIR}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
