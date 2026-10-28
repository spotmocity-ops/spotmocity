drop policy if exists "Public can read homepage content" on public.site_settings;

create policy "Public can read homepage content"
on public.site_settings
for select
to anon, authenticated
using (key in (
    'background_top_url',
    'background_middle_url',
    'background_hero_outer_url',
    'background_page_url',
    'background_top_strength',
    'background_middle_strength',
    'background_hero_outer_strength',
    'background_page_strength',
    'purpose_text',
    'home_mindfulness_quote',
    'home_mindfulness_quote_color',
    'home_mindfulness_quote_weight',
    'home_mindfulness_quote_font',
    'home_notice_content',
    'home_warm_info_content',
    'footer_background_color',
    'footer_text_color',
    'home_blog_items',
    'home_ad_items',
    'home_hero_items',
    'home_service_section_title',
    'home_service_cards',
    'home_service_categories',
    'calendar_special_days'
));
