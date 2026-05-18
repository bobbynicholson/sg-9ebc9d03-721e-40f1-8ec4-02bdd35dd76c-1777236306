/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";

export interface WhatsAppTemplate {
  id: string;
  template_key: string;
  template_name: string;
  template_content: string;
  is_enabled: boolean;
  variables: string[];
  description?: string;
  created_at: string;
  updated_at: string;
}

export const whatsappTemplateService = {
  /**
   * Get all WhatsApp templates
   */
  async getAllTemplates() {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .order('template_name', { ascending: true });

    if (error) throw error;

    return data as WhatsAppTemplate[];
  },

  /**
   * Get enabled templates only
   */
  async getEnabledTemplates() {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('is_enabled', true)
      .order('template_name', { ascending: true });

    if (error) throw error;

    return data as WhatsAppTemplate[];
  },

  /**
   * Get template by key
   */
  async getTemplateByKey(templateKey: string) {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('template_key', templateKey)
      .single();

    if (error) throw error;

    return data as WhatsAppTemplate;
  },

  /**
   * Send game invitation to client while waiting for driver
   */
  async sendGameInvitation(clientPhone: string, orderNumber: string, clientName?: string) {
    const gameUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://cateringms.com'}/client-portal?game=true`;
    
    const message = `🎮 Hi${clientName ? ' ' + clientName : ''}!\n\n` +
                   `While you wait for your driver (Order #${orderNumber}), why not have some fun?\n\n` +
                   `Play our Catering Dash game and compete for a spot on the leaderboard! 🏆\n\n` +
                   `🎯 Click here to play: ${gameUrl}\n\n` +
                   `Challenge: Can you beat the Top 10? 😊`;

    return message;
  },

  /**
   * Update template content
   */
  async updateTemplate(id: string, updates: Partial<WhatsAppTemplate>) {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return data as WhatsAppTemplate;
  },

  /**
   * Enable/disable template
   */
  async toggleTemplate(id: string, isEnabled: boolean) {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .update({
        is_enabled: isEnabled,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return data as WhatsAppTemplate;
  },

  /**
   * Preview template with sample data
   */
  previewTemplate(template: WhatsAppTemplate, sampleData: Record<string, string>) {
    let preview = template.template_content;

    Object.entries(sampleData).forEach(([key, value]) => {
      preview = preview.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });

    return preview;
  },

  /**
   * Validate template variables
   */
  validateTemplate(content: string, requiredVariables: string[]) {
    const errors: string[] = [];

    requiredVariables.forEach(variable => {
      const regex = new RegExp(`{{${variable}}}`, 'g');
      if (!regex.test(content)) {
        errors.push(`Missing required variable: {{${variable}}}`);
      }
    });

    return errors;
  },

  /**
   * Get template statistics
   */
  async getTemplateStats() {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .select('is_enabled');

    if (error) throw error;

    const total = data.length;
    const enabled = data.filter(t => t.is_enabled).length;
    const disabled = total - enabled;

    return {
      total,
      enabled,
      disabled,
      enabledPercentage: total > 0 ? Math.round((enabled / total) * 100) : 0
    };
  }
};
