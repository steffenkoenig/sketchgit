// P050 – Wire the existing i18n message catalogue via next-intl.
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,

	// P026 – Produce a minimal self-contained build artefact for the Docker
	// runner stage. next build outputs .next/standalone/ with only the files
	// required at runtime plus a trimmed node_modules copy.
	output: 'standalone',

	// P018 – Fabric.js 5.x ships CommonJS; Next.js needs to transpile it so
	// the ESM bundle can import it without module-resolution errors.
	transpilePackages: ['fabric'],

	// P056 – nonce-based CSP is now set per-request in proxy.ts.
	// The static Content-Security-Policy header with 'unsafe-inline' is removed
	// so the middleware nonce-based header is the only one sent.
	// The other security headers (X-Frame-Options, etc.) remain here as they
	// are not request-specific.
	async headers() {
		const isProd = process.env.NODE_ENV === 'production';
		return [
			{
				source: '/(.*)',
				headers: [
					{ key: 'X-Frame-Options',        value: 'DENY' },
					{ key: 'X-Content-Type-Options',  value: 'nosniff' },
					{ key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
					{
						key: 'Permissions-Policy',
						value: 'camera=(), microphone=(), geolocation=()',
					},
					...(isProd
						? [
								{
									key: 'Strict-Transport-Security',
									value: 'max-age=63072000; includeSubDomains; preload',
								},
							]
						: []),
				],
			},
		];
	},

	// P056 – propagate the per-request nonce generated in proxy.ts to all
	// Next.js auto-injected inline scripts (hydration, chunk loading, etc.).
	experimental: {
		nonce: true,
	},
};

export default withNextIntl(nextConfig);
