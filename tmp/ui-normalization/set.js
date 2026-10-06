const fs=require('fs');const p='src/pages/account/settings.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const rep=(a,b)=>{if(!s.includes(a))throw new Error('missing '+a.slice(0,80));s=s.replace(a,b);};
rep('import { User, CheckCircle } from "lucide-react";','import { User, CheckCircle, Shield, Bell, Lock } from "lucide-react";');
rep('import { ProfileTab } from "@/components/account/settings/ProfileTab";','import { ProfileTab, ProfileSummaryCard } from "@/components/account/settings/ProfileTab";');
rep('            subtitle="Manage your personal information and preferences."','            subtitle="Your profile, password, notifications and privacy in one place."');
rep(`          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="privacy">Privacy</TabsTrigger>
            </TabsList>
`,`          {/* Profile card + section menu on the left, the chosen section on
              the right. Phones: card, then a horizontal menu, then content. */}
          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            orientation="vertical"
            className="grid w-full gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start"
          >
            <div className="space-y-4 lg:sticky lg:top-6">
              <ProfileSummaryCard
                profile={profile}
                company={company}
                formData={formData}
                uploadingAvatar={uploadingAvatar}
                fileInputRef={fileInputRef}
                onAvatarPick={handleAvatarPick}
                onAvatarChange={handleAvatarChange}
              />
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm sm:grid-cols-4 lg:flex lg:flex-col lg:items-stretch dark:border-slate-800 dark:bg-slate-900">
                {([
                  { value: "profile", label: "Profile", hint: "Name and contact", icon: User },
                  { value: "security", label: "Security", hint: "Password", icon: Lock },
                  { value: "notifications", label: "Notifications", hint: "Emails you get", icon: Bell },
                  { value: "privacy", label: "Privacy", hint: "Data and visibility", icon: Shield },
                ] as const).map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="flex items-center justify-center gap-2.5 rounded-lg px-3 py-2 text-sm data-[state=active]:bg-brand-primary/10 data-[state=active]:text-brand-primary data-[state=active]:shadow-none lg:justify-start"
                  >
                    <t.icon className="h-4 w-4 shrink-0" />
                    <span className="flex flex-col items-start leading-tight">
                      <span className="font-medium">{t.label}</span>
                      <span className="hidden text-[11px] font-normal text-slate-500 lg:block">{t.hint}</span>
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="min-w-0">
`);
rep(`              <PrivacyTab userId={user.id} />
            </TabsContent>
          </Tabs>`,`              <PrivacyTab userId={user.id} />
            </TabsContent>
            </div>
          </Tabs>`);
s=s.replace(/value="(profile|security|notifications|privacy)" className="space-y-6">/g,'value="$1" className="mt-0 space-y-6">');
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
