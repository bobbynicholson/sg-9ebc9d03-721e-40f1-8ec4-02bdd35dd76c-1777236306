import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Shield, Save } from "lucide-react";
import type { PrivacySettings } from "./types";

interface Props {
  privacySettings: PrivacySettings;
  setPrivacySettings: (settings: PrivacySettings) => void;
  onSave: () => void;
}

/**
 * Privacy tab body: profile-visibility dropdown + three toggles
 * (show email / show phone / allow analytics) + a Save button.
 *
 * Extracted from /account/settings in the P2-13 audit split.
 */
export function PrivacyTab({ privacySettings, setPrivacySettings, onSave }: Props) {
  return (
    <Card className="border-0 shadow-lg dark:bg-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 dark:text-white">
          <Shield className="w-5 h-5" />
          Privacy Settings
        </CardTitle>
        <CardDescription className="dark:text-slate-400">
          Control your privacy and data sharing preferences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="dark:text-slate-200">Profile Visibility</Label>
            <Select
              value={privacySettings.profile_visibility}
              onValueChange={(value: "public" | "private" | "team") =>
                setPrivacySettings({ ...privacySettings, profile_visibility: value })
              }
            >
              <SelectTrigger className="dark:bg-slate-700 dark:text-white dark:border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public - Visible to everyone</SelectItem>
                <SelectItem value="team">Team - Visible to team members only</SelectItem>
                <SelectItem value="private">Private - Only visible to you</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator className="dark:bg-slate-700" />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base dark:text-slate-200">Show Email Address</Label>
              <p className="text-sm text-slate-500 dark:text-slate-400">Display your email on your profile</p>
            </div>
            <Switch
              checked={privacySettings.show_email}
              onCheckedChange={(checked) => setPrivacySettings({ ...privacySettings, show_email: checked })}
            />
          </div>

          <Separator className="dark:bg-slate-700" />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base dark:text-slate-200">Show Phone Number</Label>
              <p className="text-sm text-slate-500 dark:text-slate-400">Display your phone number on your profile</p>
            </div>
            <Switch
              checked={privacySettings.show_phone}
              onCheckedChange={(checked) => setPrivacySettings({ ...privacySettings, show_phone: checked })}
            />
          </div>

          <Separator className="dark:bg-slate-700" />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base dark:text-slate-200">Allow Analytics</Label>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Help us improve by sharing anonymous usage data
              </p>
            </div>
            <Switch
              checked={privacySettings.allow_analytics}
              onCheckedChange={(checked) =>
                setPrivacySettings({ ...privacySettings, allow_analytics: checked })
              }
            />
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={onSave} className="bg-orange-600 hover:bg-orange-700">
            <Save className="w-4 h-4 mr-2" />
            Save Privacy Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
