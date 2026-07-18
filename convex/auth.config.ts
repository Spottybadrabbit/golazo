// Convex validates Clerk-issued JWTs using this provider. The domain is the
// Clerk Frontend API URL (Issuer); applicationID must match the JWT template
// audience ("convex") configured in the Clerk dashboard.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
