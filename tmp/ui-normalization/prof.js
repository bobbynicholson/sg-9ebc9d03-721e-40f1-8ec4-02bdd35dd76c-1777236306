const fs=require('fs');const p='src/components/account/settings/ProfileTab.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const a=s.indexOf('/**\n * Profile tab for /account/settings.');
const head=s.slice(0,a);
// Keep the "Personal information" card verbatim
const pi0=s.indexOf('      <Card className="border border-slate-200/90 shadow-sm dark:border-slate-800 dark:bg-slate-900">\n        <CardHeader className="pb-3">\n          <CardTitle className="flex items-center gap-2 text-lg dark:text-white">\n            <User className="h-5 w-5 text-brand-primary" />\n            Personal information');
const pi1=s.indexOf('      </Card>\n\n    </div>\n  );\n}',pi0);
if(pi0<0||pi1<0) throw 'pi';
const personal=s.slice(pi0,pi1+'      </Card>\n'.length);
const body=`type SummaryProps = Pick<Props, "profile" | "company" | "formData" | "uploadingAvatar" | "fileInputRef" | "onAvatarPick" | "onAvatarChange">;

/**
 * Identity card for the left column of /account/settings: photo, name,
 * login email, role, company and member-since, with the photo upload.
 * Same handlers as before - the parent owns the upload state.
 */
export function ProfileSummaryCard({
  profile,
  company,
  formData,
  uploadingAvatar,
  fileInputRef,
  onAvatarPick,
  onAvatarChange,
}: SummaryProps) {
  const role = profile?.role as string | undefined;
  const companyName = company?.company_name || profile?.company_name;
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <Card className="overflow-hidden border border-slate-200/90 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="h-20 bg-gradient-to-r from-brand-primary via-brand-primary/80 to-brand-secondary" aria-hidden="true" />
      <CardContent className="-mt-12 flex flex-col items-center px-5 pb-5 text-center">
        <div className="relative">
          <Avatar className="h-24 w-24 bg-white ring-4 ring-white shadow-md dark:ring-slate-900">
            <AvatarImage src={formData.avatar_url} className="object-contain" />
            <AvatarFallback className="bg-brand-primary/10 text-2xl font-semibold text-brand-primary">
              {getInitials(formData.full_name || "User")}
            </AvatarFallback>
          </Avatar>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={onAvatarChange}
          />
          <button
            type="button"
            onClick={onAvatarPick}
            disabled={uploadingAvatar}
            aria-label="Change photo"
            title="Change photo (JPG, PNG or WebP, max 5 MB)"
            className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white shadow transition hover:bg-slate-700 disabled:opacity-60 dark:border-slate-900"
          >
            <Camera className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-lg font-semibold leading-tight text-slate-950 dark:text-white">
          {formData.full_name || "Your name"}
        </p>
        {formData.email && (
          <p className="mt-0.5 flex max-w-full items-center gap-1.5 truncate text-sm text-slate-500 dark:text-slate-400">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{formData.email}</span>
          </p>
        )}
        {role && (
          <Badge variant="secondary" className="mt-3 gap-1 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/10">
            <Briefcase className="h-3 w-3" />
            {ROLE_NAMES[role as keyof typeof ROLE_NAMES] || role}
          </Badge>
        )}
        <dl className="mt-4 w-full space-y-2 border-t border-slate-100 pt-4 text-left text-sm dark:border-slate-800">
          {companyName && (
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-slate-500"><Building2 className="h-3.5 w-3.5" /> Company</dt>
              <dd className="truncate font-medium text-slate-900 dark:text-slate-100">{companyName}</dd>
            </div>
          )}
          {memberSince && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Member since</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">{memberSince}</dd>
            </div>
          )}
        </dl>
        <p className="mt-3 text-[11px] text-slate-400">
          {uploadingAvatar ? "Uploading photo..." : "Tap the camera to change your photo"}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Profile tab for /account/settings: the editable personal information.
 * The identity card (photo, role, company) lives in ProfileSummaryCard,
 * shown in the page's left column.
 */
export function ProfileTab({
  profile,
  formData,
  onFormChange,
  onSave,
  saving,
}: Props) {
  const role = profile?.role as string | undefined;
  const canEditCompanyName = role === "owner" || role === "admin" || role === "super_admin";

  return (
    <div className="space-y-5">
${personal}    </div>
  );
}
`;
s=head+body;
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
