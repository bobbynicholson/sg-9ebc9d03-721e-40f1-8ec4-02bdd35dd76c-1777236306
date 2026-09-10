import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Eye, EyeOff, Shield } from "lucide-react";
import type { PasswordFormData } from "./types";

interface Props {
  passwordData: PasswordFormData;
  onFieldChange: (field: keyof PasswordFormData, value: string) => void;
  onUpdate: () => void | Promise<void>;
  busy: boolean;
}

interface PasswordStrength {
  strength: number;
  label: string;
  color: string;
}

function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { strength: 0, label: "", color: "" };

  let strength = 0;
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  if (strength <= 2) return { strength, label: "Weak", color: "text-rose-600" };
  if (strength <= 4) return { strength, label: "Medium", color: "text-yellow-600" };
  return { strength, label: "Strong", color: "text-brand-primary" };
}

/**
 * Security tab for /account/settings. Password update form with
 * show/hide toggles, live password strength meter and a mismatch
 * warning when confirm doesn't match new.
 *
 * The show/hide toggles and the strength derivation are internal -
 * the parent never reads them - so they stay local. The parent
 * still owns passwordData + the submit handler so the cross-tab
 * save state (passwordSaved, toasts) belongs in the page.
 *
 * Extracted from inline in src/pages/account/settings.tsx (P2-13
 * account/settings split).
 */
export function SecurityTab({ passwordData, onFieldChange, onUpdate, busy }: Props) {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const strength = getPasswordStrength(passwordData.newPassword);

  return (
    <Card className="border-0 shadow-lg dark:bg-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 dark:text-white">
          <Shield className="w-5 h-5" />
          Password & Security
        </CardTitle>
        <CardDescription className="dark:text-slate-400">
          Update your password to keep your account secure
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="dark:text-slate-200">Current Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                className="pl-10 pr-10 dark:bg-slate-700 dark:text-white dark:border-slate-600"
                type={showCurrent ? "text" : "password"}
                value={passwordData.currentPassword}
                onChange={(e) => onFieldChange("currentPassword", e.target.value)}
                placeholder="Enter current password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="dark:text-slate-200">New Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                className="pl-10 pr-10 dark:bg-slate-700 dark:text-white dark:border-slate-600"
                type={showNew ? "text" : "password"}
                value={passwordData.newPassword}
                onChange={(e) => onFieldChange("newPassword", e.target.value)}
                placeholder="Enter new password"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordData.newPassword && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      strength.strength <= 2
                        ? "bg-rose-500 w-1/3"
                        : strength.strength <= 4
                        ? "bg-yellow-500 w-2/3"
                        : "bg-brand-primary w-full"
                    }`}
                  />
                </div>
                <span className={`text-xs font-medium ${strength.color}`}>{strength.label}</span>
              </div>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Must be at least 8 characters with uppercase, lowercase, and numbers
            </p>
          </div>

          <div className="space-y-2">
            <Label className="dark:text-slate-200">Confirm New Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                className="pl-10 pr-10 dark:bg-slate-700 dark:text-white dark:border-slate-600"
                type={showConfirm ? "text" : "password"}
                value={passwordData.confirmPassword}
                onChange={(e) => onFieldChange("confirmPassword", e.target.value)}
                placeholder="Confirm new password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
              <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1">
                <span className="w-1 h-1 text-rose-600 rounded-full"></span>
                Passwords do not match
              </p>
            )}
          </div>
        </div>

        <Button
          onClick={onUpdate}
          disabled={busy}
          className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700"
        >
          {busy ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Updating Password...
            </>
          ) : (
            <>
              <Lock className="w-4 h-4 mr-2" />
              Update Password
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
