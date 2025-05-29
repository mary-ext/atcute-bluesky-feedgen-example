import { type Nsid } from '@atcute/lexicons';

import { AuthRequiredError, InvalidRequestError, XRPCRouter, json } from '@atcute/xrpc-server';
import { ServiceJwtVerifier, type VerifiedJwt } from '@atcute/xrpc-server/auth';
import { cors } from '@atcute/xrpc-server/middlewares/cors';

import {
	CompositeDidDocumentResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver,
} from '@atcute/identity-resolver';

import { AppBskyFeedGetFeedSkeleton } from '@atcute/bluesky';

const SERVICE_DID = 'did:web:atcute-bsky-feedgen-example.externdefs.workers.dev';
const FEEDGEN_URI = 'at://did:plc:ia76kvnndjutgedggx2ibrem/app.bsky.feed.generator/atcute-feed-example';

const router = new XRPCRouter({
	middlewares: [cors()],
});

const didDocResolver = new CompositeDidDocumentResolver({
	methods: {
		plc: new PlcDidDocumentResolver(),
		web: new WebDidDocumentResolver(),
	},
});

const jwtVerifier = new ServiceJwtVerifier({
	serviceDid: SERVICE_DID,
	resolver: didDocResolver,
});

const requireAuth = async (request: Request, lxm: Nsid): Promise<VerifiedJwt> => {
	const auth = request.headers.get('authorization');
	if (auth === null) {
		throw new AuthRequiredError({ description: `missing authorization header` });
	}
	if (!auth.startsWith('Bearer ')) {
		throw new AuthRequiredError({ description: `invalid authorization scheme` });
	}

	const jwtString = auth.slice('Bearer '.length).trim();

	const result = await jwtVerifier.verify(jwtString, { lxm });
	if (!result.ok) {
		throw new AuthRequiredError(result.error);
	}

	return result.value;
};

router.add(AppBskyFeedGetFeedSkeleton.mainSchema, {
	async handler({ params: { feed }, request }) {
		await requireAuth(request, 'app.bsky.feed.getFeedSkeleton');

		if (feed !== FEEDGEN_URI) {
			throw new InvalidRequestError({
				error: 'InvalidFeed',
				description: `invalid feed`,
			});
		}

		return json({
			feed: [
				{ post: 'at://did:plc:ia76kvnndjutgedggx2ibrem/app.bsky.feed.post/3l6uo5yecnsu7' },
				{ post: 'at://did:plc:ia76kvnndjutgedggx2ibrem/app.bsky.feed.post/3lqcdowgtas6x' },
			],
		});
	},
});

export default {
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === '/.well-known/did.json') {
			return Response.json(
				{
					'@context': ['https://www.w3.org/ns/did/v1'],
					id: SERVICE_DID,
					service: [
						{
							id: '#bsky_fg',
							type: 'BskyFeedGenerator',
							serviceEndpoint: url.origin,
						},
					],
				},
				{
					headers: {
						'access-control-allow-origin': '*',
					},
				},
			);
		}

		return router.fetch(request);
	},
} satisfies ExportedHandler;
