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

	// P019 – HTTP security headers returned on every response.
	// Note: HSTS is only set in production to avoid confusing localhost dev.
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
					{
						key: 'Content-Security-Policy',
						value: [
							"default-src 'self'",
							// Next.js injects inline scripts for hydration/bootstrapping;
							// 'unsafe-inline' is required unless a nonce-based CSP is
							// implemented end-to-end (middleware + _document nonce prop).
							"script-src 'self' 'unsafe-inline'",
							// Tailwind JIT injects inline styles at runtime.
							"style-src 'self' 'unsafe-inline'",
							"img-src 'self' data: https:",
							"font-src 'self'",
							// WebSocket connections. `ws:` and `wss:` allow any host over the
							// respective schemes; tighten to explicit URL(s) if you need stricter
							// same-host enforcement (dynamic in Next.js config is non-trivial).
							"connect-src 'self' ws: wss:",
							"frame-ancestors 'none'",
						].join('; '),
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
};

export default nextConfig;
