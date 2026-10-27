window.SpotMoCityCategories = [
    {
        value: 'limited_offers',
        label: '🏷️ 限時優惠',
        subcategories: [
            { value: 'dining_drinks', label: '餐飲微醺' },
            { value: 'experience_discounts', label: '體驗折扣' },
            { value: 'brand_popups', label: '品牌快閃' },
            { value: 'exclusive_benefits', label: '獨家福利' }
        ]
    },
    {
        value: 'leisure',
        label: '🎨 精彩休閒',
        subcategories: [
            { value: 'exhibitions', label: '展覽' },
            { value: 'markets', label: '市集' },
            { value: 'festivals', label: '節慶' },
            { value: 'outdoors', label: '戶外' },
            { value: 'pet_friendly', label: '🐾 寵物友善' },
            { value: 'art_exchange', label: '藝術交流' }
        ]
    },
    {
        value: 'adult_social',
        label: '🔗 凝聚連結',
        subcategories: [
            { value: 'boardgames', label: '桌遊／娛樂' },
            { value: 'deep_talk', label: 'Deep Talk' },
            { value: 'wine_tasting', label: '品酒' },
            { value: 'sound_healing', label: '頌缽療癒' },
            { value: 'handicrafts', label: '手作／化妝' },
            { value: 'pet_socializing', label: '寵物交流' },
            { value: 'reading_club', label: '閱讀會' }
        ]
    },
    {
        value: 'senior_community',
        label: '👵 樂齡與社區',
        subcategories: [
            { value: 'wellness_fitness', label: '養生健體' },
            { value: 'interest_classes', label: '興趣班' },
            { value: 'community_volunteering', label: '社區公益' },
            { value: 'parent_child_activities', label: '親子活動' }
        ]
    },
    {
        value: 'business_networking',
        label: '💡 創業與交流',
        subcategories: [
            { value: 'small_communities', label: '小社團' },
            { value: 'entrepreneurs', label: '創業者' },
            { value: 'salons', label: '沙龍' },
            { value: 'cross_industry', label: '跨界合作' }
        ]
    },
    {
        value: 'competitions_calls',
        label: '🏆 賽事與徵件',
        subcategories: [
            { value: 'arts_design', label: '藝文設計' },
            { value: 'business_entrepreneurship', label: '創業商業' },
            { value: 'performing_arts_music', label: '表演音樂' },
            { value: 'sports_esports', label: '體育電競' },
            { value: 'academic_stem', label: '學術STEM' }
        ]
    },
    {
        value: 'school_education',
        label: '🏫 家庭與學校',
        subcategories: [
            { value: 'school_directory', label: '學校目錄（幼兒園／中小學／大學）' },
            { value: 'campus_open_days', label: '校園開放日與招生簡章' },
            { value: 'education_talks', label: '升學與留學講座' },
            { value: 'mind_support', label: '心靈與發展支援（減壓／親子／職涯／諮詢）' }
        ]
    },
    {
        value: 'learning_certificates',
        label: '📚 學習與證書',
        subcategories: [
            { value: 'professional_certifications', label: '💼 職業資格與國際認證' },
            { value: 'language_exam_prep', label: '🗣️ 語言檢定與備考' },
            { value: 'visual_design_multimedia', label: '🎨 視覺設計與多媒體' },
            { value: 'wellness_professional_certification', label: '☕ 身心療癒與職人認證（頌缽／咖啡／瑜伽）' },
            { value: 'tutoring_subject_support', label: '✏️ 補習與學科強化' },
            { value: 'practical_skills_growth', label: '🛠️ 實用技能與自我成長' },
            { value: 'artificial_intelligence', label: '🤖 人工智能（AI）' }
        ]
    }
];

window.createLifeServiceActivityCategory = serviceCategories => {
    const subcategories = (Array.isArray(serviceCategories) ? serviceCategories : [])
        .filter(category => category && typeof category.id === 'string' && category.id && typeof category.name === 'string' && category.name)
        .flatMap(category => {
            const categoryValue = `life_service:${encodeURIComponent(category.id)}`;
            const choices = [{ value: categoryValue, label: category.name }];
            if (Array.isArray(category.subcategories)) {
                choices.push(...category.subcategories
                    .filter(subcategory => subcategory && typeof subcategory.id === 'string' && subcategory.id && typeof subcategory.name === 'string' && subcategory.name)
                    .map(subcategory => ({
                        value: `${categoryValue}:${encodeURIComponent(subcategory.id)}`,
                        label: `${category.name} · ${subcategory.name}`
                    })));
            }
            return choices;
        });
    return { value: 'life_services', label: '🤝 生活服務與資源對接', subcategories };
};