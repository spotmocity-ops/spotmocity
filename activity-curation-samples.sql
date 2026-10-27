begin;

insert into public.curated_activity_drafts (
    title,
    org_name,
    description,
    promo_copy,
    category,
    subcategory,
    age_range,
    event_time,
    event_end_date,
    event_end_time,
    event_format,
    location,
    fee,
    poster_url,
    candidate_image_urls,
    source_url,
    source_title,
    status
)
values
(
    'hush! 沙灘音樂會 x 城市運動節2026',
    '澳門文化局、美高梅',
    '活動融合現場音樂、城市運動及身心健康體驗，設有黑沙海灘主舞台、草地音樂休閒區、親子兒童舞台及戶外運動體驗。11月1日至16日另有校園及社區延伸活動。官方尚未在此公告列出每日演出時段及費用，請以主辦方最新公布為準。',
    '到黑沙海灘感受音樂與海風！hush! 沙灘音樂會今年結合城市運動與健康生活，從現場演出、親子舞台到戶外體驗，安排一趟充滿活力的海岸週末。',
    'leisure',
    'festivals',
    '待主辦方公布',
    '2026-11-14（時間待公布）',
    '2026-11-15',
    null,
    'offline',
    '澳門黑沙海灘',
    '費用待公布',
    '',
    array['https://www.gov.mo/zh-hant/wp-content/uploads/sites/4/2026/06/p26fcfv3jb.jpeg'],
    'https://www.gov.mo/zh-hant/news/1241792/',
    '澳門特區政府：hush! 沙灘音樂會 x 城市運動節2026',
    'draft'
),
(
    '第73屆澳門格蘭披治大賽車',
    '澳門格蘭披治大賽車組織委員會',
    '澳門年度國際體壇盛事，官方公布賽期為2026年11月19日至22日，設有七項賽事，包括國際汽聯FR世界盃、GT世界盃、TCR世界巡迴賽澳門站、四級方程式世界盃、格蘭披治電單車大賽、大灣區GT盃及澳門路車挑戰賽。各場賽程、門票及入場安排請查閱官方公告。',
    '引擎聲即將響徹東望洋！第73屆澳門格蘭披治大賽車將於11月回歸，四日賽期匯聚多項國際級賽事。出發前記得查看官方賽程、交通管制及門票資訊。',
    'competitions_calls',
    'sports_esports',
    '待主辦方公布',
    '2026-11-19（時間待公布）',
    '2026-11-22',
    null,
    'offline',
    '東望洋跑道，澳門',
    '門票及票價請查閱官方公布',
    '',
    array[]::text[],
    'https://www.sport.gov.mo/zh/events/timetable/type/item/id/12655',
    '澳門特區政府體育局：第73屆澳門格蘭披治大賽車大型活動時間表',
    'draft'
)
on conflict (source_url, title) do nothing;

commit;
