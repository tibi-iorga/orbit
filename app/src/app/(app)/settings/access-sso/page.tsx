import { redirect } from "next/navigation";

export default function AccessSsoSettingsPage() {
  redirect("/settings/users");
}
