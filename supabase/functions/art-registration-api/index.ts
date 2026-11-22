import { Buffer } from 'node:buffer';
import ExcelJS from 'npm:exceljs@4.4.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EVENT_KEY = 'public-art-2027';
const EVENT_ENDS_AT = '2027-03-15T23:59:59+08:00';
const REGISTRATION_DEADLINE = '2027-02-15T23:59:59+08:00';
const FILE_BUCKET = 'art-registration-files';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_FILE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_FILE_BYTES = 100 * 1024 * 1024;
const MAX_TEAM_MEMBERS = 1000;
const PAGE_SIZE = 500;
const ALLOWED_ORIGINS = new Set([
    'https://spotmocity.fyi',
    'https://www.spotmocity.fyi',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'null'
]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type JsonRecord = Record<string, unknown>;

type Contact = {
    chineseName: string;
    englishName: string;
    gender: 'male' | 'female';
    birthDate: string;
    documentType: string;
    documentNumber: string;
    phone: string;
    email: string;
};

type TeamMember = {
    chineseName: string;
    englishName: string;
    gender: 'male' | 'female';
    birthDate: string;
    documentType: string;
    documentNumber: string;
};

class HttpError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

function jsonResponse(body: unknown, status: number, headers: HeadersInit): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...Object.fromEntries(new Headers(headers)), 'Content-Type': 'application/json; charset=utf-8' }
    });
}

function corsHeaders(origin: string | null): Record<string, string> {
    const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.spotmocity.fyi';
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, x-cron-secret',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };
}

function getServiceRoleKey(): string | undefined {
    const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
    if (secretKeys) {
        try {
            const parsed: unknown = JSON.parse(secretKeys);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const defaultKey = (parsed as Record<string, unknown>).default;
                if (typeof defaultKey === 'string' && defaultKey) return defaultKey;
            }
            console.error('SUPABASE_SECRET_KEYS does not contain a default service key.');
        } catch {
            console.error('Could not parse SUPABASE_SECRET_KEYS.');
        }
    }
    return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

function requireRecord(value: unknown, field: string): JsonRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new HttpError(400, `Invalid ${field}.`);
    }
    return value as JsonRecord;
}

function requiredText(value: unknown, field: string, maximum: number): string {
    if (typeof value !== 'string') throw new HttpError(400, `${field} is required.`);
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum) {
        throw new HttpError(400, `${field} is required and must be at most ${maximum} characters.`);
    }
    return normalized;
}

function optionalText(value: unknown, field: string, maximum: number): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') throw new HttpError(400, `Invalid ${field}.`);
    const normalized = value.trim();
    if (normalized.length > maximum) throw new HttpError(400, `${field} must be at most ${maximum} characters.`);
    return normalized || null;
}

function parseInteger(value: unknown, field: string, minimum: number, maximum: number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new HttpError(400, `${field} must be between ${minimum} and ${maximum}.`);
    }
    return parsed;
}

function parseBirthDate(value: unknown, field: string): string {
    const date = requiredText(value, field, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, `${field} must use YYYY-MM-DD.`);
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || parsed > new Date()) {
        throw new HttpError(400, `${field} is invalid.`);
    }
    return date;
}

function parseGender(value: unknown, field: string): 'male' | 'female' {
    if (value !== 'male' && value !== 'female') throw new HttpError(400, `${field} is required.`);
    return value;
}

const documentTypes = new Set(['macau_id', 'hong_kong_id', 'passport', 'two_way_permit']);
function parseDocumentType(value: unknown, field: string): string {
    if (typeof value !== 'string' || !documentTypes.has(value)) {
        throw new HttpError(400, `${field} is invalid.`);
    }
    return value;
}

function parseContact(value: unknown): Contact {
    const input = requireRecord(value, 'contact');
    const phone = requiredText(input.phone, 'Contact phone', 8);
    if (!/^\d{8}$/.test(phone)) throw new HttpError(400, 'Contact phone must contain 8 digits.');
    const email = requiredText(input.email, 'Email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email is invalid.');
    return {
        chineseName: requiredText(input.chineseName, 'Chinese name', 120),
        englishName: requiredText(input.englishName, 'English name', 160),
        gender: parseGender(input.gender, 'Gender'),
        birthDate: parseBirthDate(input.birthDate, 'Birth date'),
        documentType: parseDocumentType(input.documentType, 'Document type'),
        documentNumber: requiredText(input.documentNumber, 'Document number', 80),
        phone,
        email
    };
}

function parseMember(value: unknown, index: number): TeamMember {
    const input = requireRecord(value, `team member ${index}`);
    return {
        chineseName: requiredText(input.chineseName, `Member ${index} Chinese name`, 120),
        englishName: requiredText(input.englishName, `Member ${index} English name`, 160),
        gender: parseGender(input.gender, `Member ${index} gender`),
        birthDate: parseBirthDate(input.birthDate, `Member ${index} birth date`),
        documentType: parseDocumentType(input.documentType, `Member ${index} document type`),
        documentNumber: requiredText(input.documentNumber, `Member ${index} document number`, 80)
    };
}

function cellText(value: unknown): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') {
        const excelEpoch = Date.UTC(1899, 11, 30);
        return new Date(excelEpoch + Math.round(value * 86400000)).toISOString().slice(0, 10);
    }
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
        return value.text.trim();
    }
    return '';
}

async function parseTeamWorkbook(file: File): Promise<TeamMember[]> {
    if (!file.name.toLowerCase().endsWith('.xlsx') ||
        (file.type && file.type !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
            file.type !== 'application/octet-stream')) {
        throw new HttpError(400, 'Team roster must be an .xlsx file.');
    }
    if (!file.size || file.size > MAX_FILE_BYTES) {
        throw new HttpError(400, 'Team roster file must be no larger than 5 MB.');
    }

    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()));
    } catch {
        throw new HttpError(400, 'The team roster workbook could not be opened.');
    }
    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount > MAX_TEAM_MEMBERS + 1) {
        throw new HttpError(400, `The workbook must contain no more than ${MAX_TEAM_MEMBERS} members.`);
    }

    const headers = ['中文姓名', '英文姓名', '性別', '出生日期', '證件類型', '證件號碼'];
    const headerRow = worksheet.getRow(1);
    const actualHeaders = headers.map((_, index) => cellText(headerRow.getCell(index + 1).value));
    if (actualHeaders.some((value, index) => value !== headers[index])) {
        throw new HttpError(400, `Use the downloaded roster template with these columns: ${headers.join('、')}.`);
    }

    const members: TeamMember[] = [];
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const values = headers.map((_, index) => {
            const cell = row.getCell(index + 1);
            if (cell.value && typeof cell.value === 'object' && 'formula' in cell.value) {
                throw new HttpError(400, 'Formulas are not allowed in the team roster.');
            }
            return cellText(cell.value);
        });
        if (values.every(value => !value)) continue;
        const gender = values[2] === '男' || values[2].toLowerCase() === 'male'
            ? 'male'
            : values[2] === '女' || values[2].toLowerCase() === 'female'
                ? 'female'
                : '';
        const documentType = new Map([
            ['澳門居民身份證', 'macau_id'],
            ['香港居民身份證', 'hong_kong_id'],
            ['護照', 'passport'],
            ['往來港澳通行證', 'two_way_permit']
        ]).get(values[4]) || values[4];
        members.push(parseMember({
            chineseName: values[0],
            englishName: values[1],
            gender,
            birthDate: values[3],
            documentType,
            documentNumber: values[5]
        }, members.length + 1));
    }
    if (members.length > MAX_TEAM_MEMBERS) {
        throw new HttpError(400, `A team may contain at most ${MAX_TEAM_MEMBERS} members.`);
    }
    return members;
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
    try {
        const binary = atob(value);
        const decoded = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) decoded[index] = binary.charCodeAt(index);
        return decoded;
    } catch {
        throw new Error('ART_REGISTRATION_ENCRYPTION_KEY must be base64 encoded.');
    }
}

function encodeBase64(value: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < value.length; offset += chunkSize) {
        binary += String.fromCharCode(...value.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
}

async function getEncryptionKey(): Promise<CryptoKey> {
    const configuredKey = Deno.env.get('ART_REGISTRATION_ENCRYPTION_KEY');
    if (!configuredKey) throw new Error('ART_REGISTRATION_ENCRYPTION_KEY is not configured.');
    const rawKey = decodeBase64(configuredKey);
    if (rawKey.length !== 32) throw new Error('ART_REGISTRATION_ENCRYPTION_KEY must contain 32 bytes.');
    return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptValue(value: string, key: CryptoKey, aad: string): Promise<{ ciphertext: string; iv: string }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
        key,
        encoder.encode(value)
    );
    return { ciphertext: encodeBase64(new Uint8Array(ciphertext)), iv: encodeBase64(iv) };
}

async function decryptValue(ciphertext: string, iv: string, key: CryptoKey, aad: string): Promise<string> {
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: decodeBase64(iv), additionalData: encoder.encode(aad) },
        key,
        decodeBase64(ciphertext)
    );
    return decoder.decode(plaintext);
}

function parseRegistration(value: unknown) {
    const input = requireRecord(value, 'registration');
    const groupType = input.groupType;
    if (groupType !== 'individual' && groupType !== 'team') throw new HttpError(400, 'Select an individual or team entry.');
    const registrationPlan = input.registrationPlan;
    if (registrationPlan !== 'talent' && registrationPlan !== 'crowd-dance') {
        throw new HttpError(400, 'Select a registration plan.');
    }
    const ageGroup = input.ageGroup;
    if (!['child', 'youth', 'adult', 'senior', 'intergenerational'].includes(String(ageGroup))) {
        throw new HttpError(400, 'Select an age group.');
    }
    if (!Array.isArray(input.performanceCategories)) throw new HttpError(400, 'Select at least one performance category.');
    const allowedCategories = new Set(['music', 'dance', 'drama', 'visual', 'other']);
    const categories = [...new Set(input.performanceCategories.filter(
        (item): item is string => typeof item === 'string' && allowedCategories.has(item)
    ))];
    if (!categories.length || categories.length !== input.performanceCategories.length) {
        throw new HttpError(400, 'Performance categories are invalid.');
    }
    const otherCategory = optionalText(input.otherCategory, 'Other category', 120);
    if (categories.includes('other') !== Boolean(otherCategory)) {
        throw new HttpError(400, 'Describe the other performance category when selected.');
    }
    const programDescription = requiredText(input.programDescription, 'Program description', 100);
    if (Array.from(programDescription).length > 100) throw new HttpError(400, 'Program description must be at most 100 characters.');

    const performerCount = parseInteger(input.performerCount, 'Performer count', groupType === 'individual' ? 1 : 2, MAX_TEAM_MEMBERS);
    if (groupType === 'individual' && performerCount !== 1) throw new HttpError(400, 'Individual entries must have one performer.');
    const maximumDuration = groupType === 'individual' ? 180 : 300;
    const durationSeconds = parseInteger(
        input.durationSeconds,
        'Performance duration',
        1,
        maximumDuration
    );
    const contact = parseContact(input.contact);
    const emergency = requireRecord(input.emergencyContact, 'emergency contact');
    const emergencyPhone = requiredText(emergency.phone, 'Emergency contact phone', 8);
    if (!/^\d{8}$/.test(emergencyPhone)) throw new HttpError(400, 'Emergency contact phone must contain 8 digits.');

    const accompaniment = input.accompaniment;
    if (!['audio', 'video', 'live'].includes(String(accompaniment))) {
        throw new HttpError(400, 'Select an accompaniment option.');
    }
    if (input.consentAgreed !== true) throw new HttpError(400, 'The required declarations must be accepted.');

    const teamName = groupType === 'team' ? requiredText(input.teamName, 'Team name', 160) : null;
    const members = Array.isArray(input.teamMembers)
        ? input.teamMembers.map((member, index) => parseMember(member, index + 1))
        : [];
    if (members.length > MAX_TEAM_MEMBERS) throw new HttpError(400, `A team may contain at most ${MAX_TEAM_MEMBERS} members.`);
    const stage = requireRecord(input.stageRequirements, 'stage requirements');
    const impromptuDanceOption = stage.impromptuDanceOption;
    if (!['personal', 'team', 'none'].includes(String(impromptuDanceOption))) {
        throw new HttpError(400, 'Select an impromptu dance option.');
    }
    const impromptuDanceTeamCount = impromptuDanceOption === 'team'
        ? requiredText(stage.impromptuDanceTeamCount, 'Impromptu dance team participant count', 100)
        : '';
    const wirelessMicCount = parseInteger(stage.wirelessMicCount ?? 0, 'Wireless microphone count', 0, 100);
    const headsetMicCount = parseInteger(stage.headsetMicCount ?? 0, 'Headset microphone count', 0, 100);
    const stageRequirements = {
        impromptuDanceOption: String(impromptuDanceOption),
        impromptuDanceTeamCount,
        wirelessMicCount,
        headsetMicCount,
        instrumentMicDetails: optionalText(stage.instrumentMicDetails, 'Instrument microphone details', 500),
        pianoRequired: stage.pianoRequired === true,
        largePropsDetails: optionalText(stage.largePropsDetails, 'Large props details', 500)
    };

    return {
        groupType,
        registrationPlan,
        ageGroup: String(ageGroup),
        categories,
        otherCategory,
        programTitle: requiredText(input.programTitle, 'Program title', 200),
        performerCount,
        durationSeconds,
        programDescription,
        contact,
        emergency: {
            name: requiredText(emergency.name, 'Emergency contact name', 120),
            relationship: requiredText(emergency.relationship, 'Emergency contact relationship', 80),
            phone: emergencyPhone
        },
        teamName,
        members,
        accompaniment: String(accompaniment),
        stageRequirements,
        specialStageRequirements: optionalText(input.specialStageRequirements, 'Special stage requirements', 2000) || '',
        consentAgreed: true
    };
}

function excelFileFrom(form: FormData): File | null {
    const value = form.get('team_file');
    if (value === null || typeof value === 'string') return null;
    return value;
}

function stageFileFrom(form: FormData): File | null {
    const value = form.get('stage_file');
    if (value === null || typeof value === 'string') return null;
    return value;
}

function parseRequestPayload(form: FormData): unknown {
    const raw = form.get('payload');
    if (typeof raw !== 'string' || raw.length > 2000000) throw new HttpError(400, 'Registration payload is invalid.');
    try {
        return JSON.parse(raw);
    } catch {
        throw new HttpError(400, 'Registration payload is not valid JSON.');
    }
}

function formatDocumentType(value: string): string {
    return ({
        macau_id: '澳門居民身份證',
        hong_kong_id: '香港居民身份證',
        passport: '護照',
        two_way_permit: '往來港澳通行證'
    } as Record<string, string>)[value] || value;
}

function formatCategory(value: string): string {
    return ({
        music: '音樂',
        dance: '舞蹈',
        drama: '戲劇／曲藝',
        visual: '雜技／魔術／其他視覺藝術表演',
        other: '其他'
    } as Record<string, string>)[value] || value;
}

function csvCell(value: unknown): string {
    let text = String(value ?? '');
    if (/^[\s\u0000]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

function csvResponse(rows: unknown[][], filename: string, headers: HeadersInit): Response {
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    return new Response(csv, {
        status: 200,
        headers: {
            ...Object.fromEntries(new Headers(headers)),
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store'
        }
    });
}

async function verifyAdmin(request: Request, supabaseUrl: string, apiKey: string): Promise<void> {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token || token === apiKey) throw new HttpError(401, 'Administrator sign-in is required.');
    const authClient = createClient(supabaseUrl, apiKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) throw new HttpError(401, 'Administrator sign-in is invalid or expired.');
    const { data: isAdmin, error: roleError } = await authClient.rpc('is_admin');
    if (roleError) throw new HttpError(500, 'Administrator permission check failed.');
    if (isAdmin !== true) throw new HttpError(403, 'Administrator permission is required.');
}

async function fetchAllRegistrations(serviceClient: ReturnType<typeof createClient>): Promise<JsonRecord[]> {
    const rows: JsonRecord[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await serviceClient
            .from('art_registrations')
            .select('*')
            .eq('submission_status', 'submitted')
            .order('submitted_at', { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);
        if (error) {
            console.error('Art registration query failed:', error.code || 'unknown');
            throw new HttpError(500, 'Could not load art registrations.');
        }
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
        if (rows.length >= 10000) throw new HttpError(503, 'Too many registrations to load at once.');
    }
    return rows;
}

async function fetchTeamMembers(serviceClient: ReturnType<typeof createClient>, registrationIds: string[]): Promise<Map<string, JsonRecord[]>> {
    const membersByRegistration = new Map<string, JsonRecord[]>();
    for (let offset = 0; offset < registrationIds.length; offset += 200) {
        const ids = registrationIds.slice(offset, offset + 200);
        const { data, error } = await serviceClient
            .from('art_team_members')
            .select('*')
            .in('registration_id', ids)
            .order('member_order', { ascending: true });
        if (error) {
            console.error('Art team member query failed:', error.code || 'unknown');
            throw new HttpError(500, 'Could not load team members.');
        }
        for (const member of data || []) {
            const list = membersByRegistration.get(member.registration_id) || [];
            list.push(member);
            membersByRegistration.set(member.registration_id, list);
        }
    }
    return membersByRegistration;
}

async function decryptPerson(
    person: JsonRecord,
    prefix: string,
    id: string,
    key: CryptoKey
): Promise<JsonRecord> {
    const birthDate = await decryptValue(
        String(person[`${prefix}birth_date_ciphertext`]),
        String(person[`${prefix}birth_date_iv`]),
        key,
        `${id}:birth-date`
    );
    const documentNumber = await decryptValue(
        String(person[`${prefix}document_number_ciphertext`]),
        String(person[`${prefix}document_number_iv`]),
        key,
        `${id}:document-number`
    );
    const safePerson: JsonRecord = {};
    for (const [field, value] of Object.entries(person)) {
        if (!field.endsWith('_ciphertext') && !field.endsWith('_iv')) safePerson[field] = value;
    }
    return {
        ...safePerson,
        birth_date: birthDate,
        document_number: documentNumber
    };
}

async function getDecryptedRegistrations(
    serviceClient: ReturnType<typeof createClient>,
    key: CryptoKey
): Promise<JsonRecord[]> {
    const registrations = await fetchAllRegistrations(serviceClient);
    const membersByRegistration = await fetchTeamMembers(serviceClient, registrations.map(row => String(row.id)));
    const result: JsonRecord[] = [];
    for (const registration of registrations) {
        const decryptedContact = await decryptPerson(registration, 'contact_', String(registration.id), key);
        const contact = {
            chinese_name: registration.contact_zh_name,
            english_name: registration.contact_en_name,
            gender: registration.contact_gender,
            birth_date: decryptedContact.birth_date,
            document_type: registration.contact_document_type,
            document_number: decryptedContact.document_number,
            phone: registration.contact_phone,
            email: registration.contact_email
        };
        const members = [];
        for (const member of membersByRegistration.get(String(registration.id)) || []) {
            members.push(await decryptPerson(member, '', String(member.id), key));
        }
        result.push({
            id: registration.id,
            reference_number: registration.reference_number,
            registration_plan: registration.registration_plan,
            review_status: registration.review_status || 'pending',
            group_type: registration.group_type,
            age_group: registration.age_group,
            performance_categories: registration.performance_categories,
            other_category: registration.other_category,
            program_title: registration.program_title,
            performer_count: registration.performer_count,
            duration_seconds: registration.duration_seconds,
            program_description: registration.program_description,
            emergency_contact_name: registration.emergency_contact_name,
            emergency_contact_relationship: registration.emergency_contact_relationship,
            emergency_contact_phone: registration.emergency_contact_phone,
            team_name: registration.team_name,
            team_file_name: registration.team_file_name,
            accompaniment: registration.accompaniment,
            stage_requirements: registration.stage_requirements,
            special_stage_requirements: registration.special_stage_requirements,
            stage_file_name: registration.stage_file_name,
            consent_version: registration.consent_version,
            submitted_at: registration.submitted_at,
            contact,
            members
        });
    }
    return result;
}

function stageCsvRows(registrations: JsonRecord[]): unknown[][] {
    const rows: unknown[][] = [[
        '組別',
        '團體／節目名稱',
        '節目名稱',
        '表演類別',
        '演出人數',
        '演出時長（秒）',
        '伴奏需求',
        '伴奏檔案',
        '百人即興共舞',
        '手持無線麥克風數量',
        '頭戴／領夾麥克風數量',
        '樂器收音／DI需求',
        '場地鋼琴／電子琴',
        '大型樂器／道具',
        '其他舞台需求'
    ]];
    for (const registration of registrations) {
        const stage = requireRecord(registration.stage_requirements, 'stored stage requirements');
        rows.push([
            registration.group_type === 'team' ? '團體組' : '個人組',
            registration.team_name || registration.program_title,
            registration.program_title,
            (registration.performance_categories as string[]).map(formatCategory).concat(
                typeof registration.other_category === 'string' ? [registration.other_category] : []
            ).join('、'),
            registration.performer_count,
            registration.duration_seconds,
            registration.accompaniment === 'audio' ? '播放音訊' : registration.accompaniment === 'video' ? '播放背景影片' : '現場原聲',
            registration.stage_file_name || '',
            stage.impromptuDanceOption === 'personal'
                ? '個人參加'
                : stage.impromptuDanceOption === 'team'
                    ? `全隊參加：${stage.impromptuDanceTeamCount || ''}`
                    : '不參加',
            stage.wirelessMicCount || 0,
            stage.headsetMicCount || 0,
            stage.instrumentMicDetails || '',
            stage.pianoRequired ? '需要' : '不需要',
            stage.largePropsDetails || '',
            registration.special_stage_requirements || ''
        ]);
    }
    return rows;
}

async function insuranceCsvRows(registrations: JsonRecord[]): Promise<unknown[][]> {
    const rows: unknown[][] = [[
        '報名編號',
        '團體名稱',
        '身份',
        '中文姓名',
        '英文姓名',
        '性別',
        '出生日期',
        '證件類型',
        '證件號碼',
        '聯絡電話',
        'Email',
        '緊急聯絡人',
        '緊急聯絡關係',
        '緊急聯絡電話'
    ]];
    for (const registration of registrations) {
        const teamName = String(registration.team_name || '');
        const emergency = [
            registration.emergency_contact_name,
            registration.emergency_contact_relationship,
            registration.emergency_contact_phone
        ];
        const contact = registration.contact as JsonRecord;
        const addPerson = (person: JsonRecord, role: string, phone: unknown, email: unknown) => rows.push([
            registration.id,
            teamName,
            role,
            person.chinese_name,
            person.english_name,
            person.gender === 'male' ? '男' : '女',
            person.birth_date,
            formatDocumentType(String(person.document_type)),
            person.document_number,
            phone || '',
            email || '',
            ...emergency
        ]);
        if (registration.group_type === 'individual') {
            addPerson(contact, '個人表演者／主要聯絡人', contact.phone, contact.email);
            continue;
        }

        const memberRows = registration.members as JsonRecord[];
        const contactNumber = String(contact.document_number).replace(/[\s()-]/g, '').toUpperCase();
        let contactIncluded = false;
        for (const member of memberRows) {
            const memberNumber = String(member.document_number).replace(/[\s()-]/g, '').toUpperCase();
            const isContact = member.document_type === contact.document_type && memberNumber === contactNumber;
            contactIncluded ||= isContact;
            addPerson(member, isContact ? '團體成員／主要聯絡人' : '團體成員', isContact ? contact.phone : '', isContact ? contact.email : '');
        }
        if (!contactIncluded) {
            addPerson(contact, '主要聯絡人（請主辦方確認投保資格）', contact.phone, contact.email);
        }
    }
    return rows;
}

async function removeStoredFiles(
    serviceClient: ReturnType<typeof createClient>,
    paths: Array<string | null | undefined>
): Promise<void> {
    const uniquePaths = [...new Set(paths.filter((path): path is string => typeof path === 'string' && path.length > 0))];
    for (let offset = 0; offset < uniquePaths.length; offset += 100) {
        const { error } = await serviceClient.storage.from(FILE_BUCKET).remove(uniquePaths.slice(offset, offset + 100));
        if (error && String(error.statusCode) !== '404') {
            console.error('Encrypted roster removal failed:', error.statusCode || 'unknown');
            throw new HttpError(500, 'Could not securely delete encrypted roster files.');
        }
    }
}

async function submitRegistration(
    request: Request,
    form: FormData,
    serviceClient: ReturnType<typeof createClient>,
    encryptionKey: CryptoKey
): Promise<Response> {
    if (Date.now() > Date.parse(REGISTRATION_DEADLINE)) {
        throw new HttpError(409, '報名已截止。');
    }
    const honeypot = form.get('website');
    if (typeof honeypot === 'string' && honeypot.trim()) {
        throw new HttpError(400, 'Request rejected.');
    }
    const input = parseRegistration(parseRequestPayload(form));
    const uploadedFile = excelFileFrom(form);
    const uploadedStageFile = stageFileFrom(form);
    if (uploadedStageFile) {
        const stageName = uploadedStageFile.name.toLowerCase();
        if (input.accompaniment === 'audio') {
            if (!/\.(mp3|wav)$/.test(stageName) ||
                !uploadedStageFile.size ||
                uploadedStageFile.size > MAX_AUDIO_FILE_BYTES) {
                throw new HttpError(400, 'The audio file must be MP3 or WAV and no larger than 50 MB.');
            }
        } else if (input.accompaniment === 'video') {
            if (!/\.mp4$/.test(stageName) ||
                !uploadedStageFile.size ||
                uploadedStageFile.size > MAX_VIDEO_FILE_BYTES) {
                throw new HttpError(400, 'The video file must be MP4 and no larger than 100 MB.');
            }
        } else {
            throw new HttpError(400, 'A stage file is not allowed for live accompaniment.');
        }
    } else if (input.accompaniment === 'audio' || input.accompaniment === 'video') {
        throw new HttpError(400, 'Please upload the required accompaniment file.');
    }
    let members = input.members;
    if (uploadedFile) {
        if (members.length) throw new HttpError(400, 'Use either the dynamic member list or the Excel file, not both.');
        members = await parseTeamWorkbook(uploadedFile);
    }
    if (input.groupType === 'team') {
        if (members.length < 2) throw new HttpError(400, 'A team must provide at least two member records.');
        if (members.length !== input.performerCount) throw new HttpError(400, 'Performer count must match the team member list.');
    } else if (members.length || uploadedFile) {
        throw new HttpError(400, 'Individual entries cannot include a team roster.');
    }

    const registrationId = crypto.randomUUID();
    const contactBirthDate = await encryptValue(input.contact.birthDate, encryptionKey, `${registrationId}:birth-date`);
    const contactDocumentNumber = await encryptValue(input.contact.documentNumber, encryptionKey, `${registrationId}:document-number`);
    const registrationRow = {
        id: registrationId,
        event_key: EVENT_KEY,
        registration_plan: input.registrationPlan,
        group_type: input.groupType,
        age_group: input.ageGroup,
        performance_categories: input.categories,
        other_category: input.otherCategory,
        program_title: input.programTitle,
        performer_count: input.performerCount,
        duration_seconds: input.durationSeconds,
        program_description: input.programDescription,
        contact_zh_name: input.contact.chineseName,
        contact_en_name: input.contact.englishName,
        contact_gender: input.contact.gender,
        contact_birth_date_ciphertext: contactBirthDate.ciphertext,
        contact_birth_date_iv: contactBirthDate.iv,
        contact_document_type: input.contact.documentType,
        contact_document_number_ciphertext: contactDocumentNumber.ciphertext,
        contact_document_number_iv: contactDocumentNumber.iv,
        contact_phone: input.contact.phone,
        contact_email: input.contact.email,
        emergency_contact_name: input.emergency.name,
        emergency_contact_relationship: input.emergency.relationship,
        emergency_contact_phone: input.emergency.phone,
        team_name: input.teamName,
        accompaniment: input.accompaniment,
        stage_requirements: input.stageRequirements,
        special_stage_requirements: input.specialStageRequirements,
        consent_agreed: input.consentAgreed,
        consent_version: 'public-art-2027-v1',
        submission_status: 'processing',
        team_file_path: null as string | null,
        team_file_name: uploadedFile?.name || null,
        stage_file_path: null as string | null,
        stage_file_name: uploadedStageFile?.name || null,
        event_ends_at: EVENT_ENDS_AT
    };

    const memberRows = [];
    for (const [index, member] of members.entries()) {
        const memberId = crypto.randomUUID();
        const birthDate = await encryptValue(member.birthDate, encryptionKey, `${memberId}:birth-date`);
        const documentNumber = await encryptValue(member.documentNumber, encryptionKey, `${memberId}:document-number`);
        memberRows.push({
            id: memberId,
            registration_id: registrationId,
            member_order: index + 1,
            chinese_name: member.chineseName,
            english_name: member.englishName,
            gender: member.gender,
            birth_date_ciphertext: birthDate.ciphertext,
            birth_date_iv: birthDate.iv,
            document_type: member.documentType,
            document_number_ciphertext: documentNumber.ciphertext,
            document_number_iv: documentNumber.iv
        });
    }

    let encryptedFilePath: string | null = null;
    let encryptedRosterPayload: Uint8Array | null = null;
    let encryptedStageFilePath: string | null = null;
    let encryptedStagePayload: Uint8Array | null = null;
    if (uploadedStageFile) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const fileBytes = new Uint8Array(await uploadedStageFile.arrayBuffer());
        const encrypted = new Uint8Array(await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv, additionalData: encoder.encode(`${registrationId}:stage-file`) },
            encryptionKey,
            fileBytes
        ));
        const payload = new Uint8Array(iv.length + encrypted.length);
        payload.set(iv, 0);
        payload.set(encrypted, iv.length);
        encryptedStagePayload = payload;
        encryptedStageFilePath = `${registrationId}/${crypto.randomUUID()}.${input.accompaniment === 'audio' ? 'audio.enc' : 'video.enc'}`;
        registrationRow.stage_file_path = encryptedStageFilePath;
    }
    if (uploadedFile) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const fileBytes = new Uint8Array(await uploadedFile.arrayBuffer());
        const encrypted = new Uint8Array(await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv, additionalData: encoder.encode(`${registrationId}:team-file`) },
            encryptionKey,
            fileBytes
        ));
        const payload = new Uint8Array(iv.length + encrypted.length);
        payload.set(iv, 0);
        payload.set(encrypted, iv.length);
        encryptedRosterPayload = payload;
        encryptedFilePath = `${registrationId}/${crypto.randomUUID()}.xlsx.enc`;
        registrationRow.team_file_path = encryptedFilePath;
    }

    const { data: insertedRegistration, error: registrationError } = await serviceClient
        .from('art_registrations')
        .insert(registrationRow)
        .select('reference_number')
        .maybeSingle();
    if (registrationError) {
        console.error('Art registration insert failed:', registrationError.code || 'unknown');
        throw new HttpError(500, 'Could not save this registration. Please try again.');
    }
    if (memberRows.length) {
        const { error: memberError } = await serviceClient.from('art_team_members').insert(memberRows);
        if (memberError) {
            const { error: cleanupError } = await serviceClient.from('art_registrations').delete().eq('id', registrationId);
            if (cleanupError) console.error('Failed to clean up incomplete registration:', cleanupError.code || 'unknown');
            console.error('Team member insert failed:', memberError.code || 'unknown');
            throw new HttpError(500, 'Could not save the team roster. Please try again.');
        }
    }

    if (encryptedStageFilePath && encryptedStagePayload) {
        const { error: stageUploadError } = await serviceClient.storage
            .from(FILE_BUCKET)
            .upload(encryptedStageFilePath, encryptedStagePayload, {
                contentType: 'application/octet-stream',
                upsert: false
            });
        if (stageUploadError) {
            console.error('Encrypted stage file upload failed:', stageUploadError.statusCode || 'unknown');
            await removeStoredFiles(serviceClient, [encryptedStageFilePath, encryptedFilePath]);
            const { error: cleanupError } = await serviceClient.from('art_registrations').delete().eq('id', registrationId);
            if (cleanupError) console.error('Failed to clean up a registration with a failed stage upload:', cleanupError.code || 'unknown');
            throw new HttpError(500, 'Could not securely store the accompaniment file.');
        }
    }

    if (encryptedFilePath && encryptedRosterPayload) {
        const { error: uploadError } = await serviceClient.storage
            .from(FILE_BUCKET)
            .upload(encryptedFilePath, encryptedRosterPayload, {
                contentType: 'application/octet-stream',
                upsert: false
            });
        if (uploadError) {
            console.error('Encrypted roster upload failed:', uploadError.statusCode || 'unknown');
            await removeStoredFiles(serviceClient, [encryptedFilePath, encryptedStageFilePath]);
            const { error: cleanupError } = await serviceClient.from('art_registrations').delete().eq('id', registrationId);
            if (cleanupError) console.error('Failed to clean up a registration with a failed roster upload:', cleanupError.code || 'unknown');
            throw new HttpError(500, 'Could not securely store the team roster.');
        }
    }

    const { error: completeError } = await serviceClient
        .from('art_registrations')
        .update({ submission_status: 'submitted' })
        .eq('id', registrationId);
    if (completeError) {
        console.error('Could not mark the art registration as complete:', completeError.code || 'unknown');
        throw new HttpError(500, 'Could not complete the registration. Please contact the organizer before submitting again.');
    }

    return jsonResponse({
        ok: true,
        reference: typeof insertedRegistration?.reference_number === 'string'
            ? insertedRegistration.reference_number
            : registrationId.slice(0, 8).toUpperCase(),
        submittedAt: new Date().toISOString()
    }, 201, corsHeaders(request.headers.get('origin')));
}

async function purgeExpiredRegistrations(serviceClient: ReturnType<typeof createClient>): Promise<Response> {
    const now = Date.now();
    const staleProcessingCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const staleProcessing: JsonRecord[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await serviceClient
            .from('art_registrations')
            .select('id,team_file_path,stage_file_path')
            .eq('submission_status', 'processing')
            .lte('submitted_at', staleProcessingCutoff)
            .order('id', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
        if (error) {
            console.error('Stale registration query failed:', error.code || 'unknown');
            throw new HttpError(500, 'Could not check incomplete registrations.');
        }
        staleProcessing.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
    }
    if (staleProcessing.length) {
        await removeStoredFiles(serviceClient, staleProcessing.flatMap(row => [
            typeof row.team_file_path === 'string' ? row.team_file_path : null,
            typeof row.stage_file_path === 'string' ? row.stage_file_path : null
        ]));
        const staleIds = staleProcessing.map(row => row.id);
        for (let offset = 0; offset < staleIds.length; offset += 200) {
            const { error } = await serviceClient.from('art_registrations').delete().in('id', staleIds.slice(offset, offset + 200));
            if (error) {
                console.error('Stale registration deletion failed:', error.code || 'unknown');
                throw new HttpError(500, 'Could not delete incomplete registrations.');
            }
        }
    }

    const cutoff = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
    const expired: JsonRecord[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await serviceClient
            .from('art_registrations')
            .select('id,event_key,group_type,performer_count,team_file_path,stage_file_path,event_ends_at,submission_status')
            .eq('event_key', EVENT_KEY)
            .lte('event_ends_at', cutoff)
            .order('id', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
        if (error) {
            console.error('Expired registration query failed:', error.code || 'unknown');
            throw new HttpError(500, 'Could not check data-retention expiry.');
        }
        expired.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
    }
    if (!expired.length) return jsonResponse({ purged: 0, incompletePurged: staleProcessing.length }, 200, {});

    await removeStoredFiles(serviceClient, expired.flatMap(row => [
        typeof row.team_file_path === 'string' ? row.team_file_path : null,
        typeof row.stage_file_path === 'string' ? row.stage_file_path : null
    ]));
    const completed = expired.filter(row => row.submission_status === 'submitted');
    if (completed.length) {
        const { error: aggregateError } = await serviceClient.from('art_registration_aggregates').upsert({
            event_key: EVENT_KEY,
            registration_count: completed.length,
            performer_count: completed.reduce((sum, row) => sum + Number(row.performer_count || 0), 0),
            individual_count: completed.filter(row => row.group_type === 'individual').length,
            team_count: completed.filter(row => row.group_type === 'team').length,
            purged_at: new Date().toISOString()
        }, { onConflict: 'event_key', ignoreDuplicates: true });
        if (aggregateError) {
            console.error('Anonymous registration aggregate insert failed:', aggregateError.code || 'unknown');
            throw new HttpError(500, 'Could not archive anonymous registration counts.');
        }
    }

    const ids = expired.map(row => row.id);
    for (let offset = 0; offset < ids.length; offset += 200) {
        const { error } = await serviceClient.from('art_registrations').delete().in('id', ids.slice(offset, offset + 200));
        if (error) {
            console.error('Expired registration deletion failed:', error.code || 'unknown');
            throw new HttpError(500, 'Could not delete expired personal data.');
        }
    }
    return jsonResponse({ purged: completed.length, incompletePurged: staleProcessing.length }, 200, {});
}

Deno.serve(async request => {
    const origin = request.headers.get('origin');
    const headers = corsHeaders(origin);
    if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response('Origin not allowed', { status: 403, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = getServiceRoleKey();
    const apiKey = request.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
        console.error('Art registration Supabase environment is incomplete.');
        return jsonResponse({ error: 'Registration service is not configured.' }, 500, headers);
    }

    try {
        const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('multipart/form-data')) {
            const form = await request.formData();
            return await submitRegistration(request, form, serviceClient, await getEncryptionKey());
        }

        let body: JsonRecord;
        try {
            body = requireRecord(await request.json(), 'request');
        } catch (error) {
            if (error instanceof HttpError) throw error;
            throw new HttpError(400, 'Request must contain valid JSON.');
        }
        const action = body.action;
        if (action === 'purge') {
            const configuredSecret = Deno.env.get('ART_REGISTRATION_CRON_SECRET');
            const receivedSecret = request.headers.get('x-cron-secret');
            if (!configuredSecret || !receivedSecret || configuredSecret !== receivedSecret) {
                throw new HttpError(401, 'Unauthorized.');
            }
            return await purgeExpiredRegistrations(serviceClient);
        }

        if (!apiKey) throw new HttpError(500, 'Supabase public API key is not available.');
        await verifyAdmin(request, supabaseUrl, apiKey);
        const encryptionKey = await getEncryptionKey();
        if (action === 'list') {
            return jsonResponse({ registrations: await getDecryptedRegistrations(serviceClient, encryptionKey) }, 200, headers);
        }
        if (action === 'download-file') {
            const registrationId = typeof body.registrationId === 'string' ? body.registrationId.trim() : '';
            const fileType = body.fileType;
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registrationId)) {
                throw new HttpError(400, 'Registration ID is invalid.');
            }
            if (fileType !== 'stage' && fileType !== 'team') {
                throw new HttpError(400, 'File type is invalid.');
            }
            const { data: registration, error: queryError } = await serviceClient
                .from('art_registrations')
                .select('id,team_file_path,team_file_name,stage_file_path,stage_file_name')
                .eq('id', registrationId)
                .maybeSingle();
            if (queryError) throw new HttpError(500, 'Could not locate this registration.');
            if (!registration) throw new HttpError(404, 'Registration not found.');

            const filePath = fileType === 'stage' ? registration.stage_file_path : registration.team_file_path;
            const fileName = fileType === 'stage' ? registration.stage_file_name : registration.team_file_name;
            if (typeof filePath !== 'string' || typeof fileName !== 'string' || !fileName) {
                throw new HttpError(404, 'The requested file was not found.');
            }
            const { data: encryptedBlob, error: downloadError } = await serviceClient.storage
                .from(FILE_BUCKET)
                .download(filePath);
            if (downloadError || !encryptedBlob) throw new HttpError(404, 'The requested file could not be downloaded.');

            const payload = new Uint8Array(await encryptedBlob.arrayBuffer());
            if (payload.length < 13) throw new HttpError(500, 'The stored file is invalid.');
            const iv = payload.slice(0, 12);
            const ciphertext = payload.slice(12);
            const decrypted = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv,
                    additionalData: encoder.encode(`${registrationId}:${fileType}-file`)
                },
                encryptionKey,
                ciphertext
            );
            const safeName = fileName.replace(/[^\p{L}\p{N}._()\- ]/gu, '_').slice(0, 180);
            const downloadHeaders = {
                ...headers,
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`
            };
            return new Response(decrypted, {
                status: 200,
                headers: downloadHeaders
            });
        }
        if (action === 'set-review-status') {
            const registrationId = typeof body.registrationId === 'string' ? body.registrationId.trim() : '';
            const reviewStatus = body.reviewStatus;
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registrationId)) {
                throw new HttpError(400, 'Registration ID is invalid.');
            }
            if (!['pending', 'included', 'excluded'].includes(String(reviewStatus))) {
                throw new HttpError(400, 'Review status is invalid.');
            }
            const { error: statusError } = await serviceClient
                .from('art_registrations')
                .update({ review_status: String(reviewStatus) })
                .eq('id', registrationId);
            if (statusError) {
                console.error('Registration status update failed:', statusError.code || 'unknown');
                throw new HttpError(500, 'Could not update the registration status.');
            }
            return jsonResponse({ updated: true, registrationId, reviewStatus }, 200, headers);
        }
        if (action === 'delete-registration') {
            const registrationId = typeof body.registrationId === 'string' ? body.registrationId.trim() : '';
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registrationId)) {
                throw new HttpError(400, 'Registration ID is invalid.');
            }
            const { data: registration, error: queryError } = await serviceClient
                .from('art_registrations')
                .select('id,team_file_path,stage_file_path')
                .eq('id', registrationId)
                .maybeSingle();
            if (queryError) {
                console.error('Registration deletion lookup failed:', queryError.code || 'unknown');
                throw new HttpError(500, 'Could not locate this registration.');
            }
            if (!registration) throw new HttpError(404, 'Registration not found.');
            await removeStoredFiles(serviceClient, [
                typeof registration.team_file_path === 'string' ? registration.team_file_path : null,
                typeof registration.stage_file_path === 'string' ? registration.stage_file_path : null
            ]);
            const { error: deleteError } = await serviceClient
                .from('art_registrations')
                .delete()
                .eq('id', registrationId);
            if (deleteError) {
                console.error('Registration deletion failed:', deleteError.code || 'unknown');
                throw new HttpError(500, 'Could not delete this registration.');
            }
            return jsonResponse({ deleted: true, registrationId }, 200, headers);
        }
        if (action === 'export-stage') {
            const registrations = await fetchAllRegistrations(serviceClient);
            return csvResponse(stageCsvRows(registrations), 'art-stage-coordination.csv', headers);
        }
        if (action === 'export-insurance') {
            const registrations = await getDecryptedRegistrations(serviceClient, encryptionKey);
            return csvResponse(await insuranceCsvRows(registrations), 'art-insurance-roster.csv', headers);
        }
        throw new HttpError(400, 'Unsupported action.');
    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const message = error instanceof HttpError ? error.message : 'The request could not be completed.';
        if (!(error instanceof HttpError)) console.error('Art registration request failed.');
        return jsonResponse({ error: message }, status, headers);
    }
});
