import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: ["/feedback/:path*", "/import/:path*", "/imports/:path*", "/settings/:path*", "/opportunities/:path*", "/roadmap/:path*"],
};
