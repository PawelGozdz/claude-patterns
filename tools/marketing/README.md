# Marketing Tools (vendored reference)

**60 CLI helpers + 75+ integration guides** for marketing platforms (analytics,
email, ads, CRM, SEO data, payments, referrals).

## Origin & Attribution

Vendored from
[**coreyhaines31/marketingskills**](https://github.com/coreyhaines31/marketingskills/tree/main/tools)
by [Corey Haines](https://corey.co) (MIT license).

Updates pulled by `scripts/sync-marketing-skills.sh`.

## Layout

```
tools/marketing/
├── REGISTRY.md        # tool index — start here
├── integrations/      # 75+ markdown guides per platform
│   ├── ga4.md, mixpanel.md, amplitude.md, posthog.md, ...
│   ├── hubspot.md, salesforce.md, stripe.md, paddle.md, ...
│   ├── mailchimp.md, klaviyo.md, customer-io.md, sendgrid.md, ...
│   ├── google-ads.md, meta-ads.md, linkedin-ads.md, tiktok-ads.md, ...
│   └── ...
├── clis/              # 60 Node.js CLI reference scripts
│   └── ga4.js, stripe.js, hubspot patterns, ...
└── composio/          # Composio bridge for OAuth-heavy platforms
    └── marketing-tools.md
```

## How These Are Used

These are **reference materials**, not runnable plumbing in the
claude-patterns repo. Marketing skills consult `REGISTRY.md` and the
matching guide in `integrations/` to recommend the right integration
approach (API / MCP / SDK / CLI) for a given task.

The `clis/*.js` files are **example code** — adapt them inside your project,
do not invoke them from claude-patterns.

## What `@marketing-strategist` Does With These

When a marketing task needs tooling (e.g., "set up GA4 events for signup
funnel"):

1. Reads [`REGISTRY.md`](./REGISTRY.md) to find the tool
2. Reads `integrations/<tool>.md` for setup notes and common operations
3. Recommends an approach to the user — never executes credentials or hits
   external APIs

## Categories Covered

- **Analytics**: GA4, Mixpanel, Amplitude, PostHog, Segment, Plausible,
  Adobe Analytics
- **SEO data**: Google Search Console, Semrush, Ahrefs, DataForSEO,
  Keywords Everywhere
- **Data enrichment**: Clearbit, Apollo, ZoomInfo, Clay, Hunter
- **CRM**: HubSpot, Salesforce, Close, Intercom
- **Payments**: Stripe, Paddle
- **Referral / Affiliate**: Rewardful, Tolt, Mention Me, PartnerStack
- **Email**: Mailchimp, Klaviyo, Customer.io, SendGrid, Resend, Kit,
  Postmark, Brevo, ActiveCampaign
- **Ads**: Google Ads, Meta Ads, LinkedIn Ads, TikTok Ads
- **Webinars / Events**: Demio, Livestorm, Calendly, SavvyCal
- **Outbound**: Apollo, Instantly, Lemlist, Outreach, Snov
- **Reviews / Social proof**: G2, Trustpilot
- **Push / SMS**: OneSignal, Klaviyo, Twilio (via integrations)
- **Headless CMS**: Contentful, Sanity, Webflow, WordPress, Strapi
- **Misc**: Zapier, Buffer, Hotjar, Optimizely, Wistia, Heygen, Hyperframes

See [`REGISTRY.md`](./REGISTRY.md) for the full table with API / MCP / CLI /
SDK availability per tool.

## License

MIT — see upstream
[LICENSE](https://github.com/coreyhaines31/marketingskills/blob/main/LICENSE).
