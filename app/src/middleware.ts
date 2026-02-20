import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: ["/features/:path*", "/import/:path*", "/imports/:path*", "/report/:path*", "/settings/:path*"],
};
