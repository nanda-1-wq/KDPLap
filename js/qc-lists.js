/* ═══════════════════════════════════════════════════
   NicheInk · 07 Quality Control: the word lists (E14.2)
   /js/qc-lists.js   (used by js/qc-rules.js; tested by tests/qc-rules.test.js)

   Data only. The rules live in js/qc-rules.js.

   kdpQcLists.US_UK         [us stem, uk stem, suffixes]: every suffix on both
                            stems makes one pair; '-' is the bare stem. Pairs
                            with two meanings are left out on purpose:
                            practice/practise, program/programme, meter/metre,
                            license/licence, check/cheque, tire/tyre,
                            story/storey (plan section 5), and curb/kerb,
                            draft/draught, disk/disc, dialog/dialogue,
                            gray/grey (a name in "Earl Grey").
   kdpQcLists.SPACE_VARIANTS [spaced, closed]: one term written two ways.
   kdpQcLists.NOUN_VERB     spaced forms that are a verb while the other form is
                            a noun ("warm up", "the warm-up"). Never compared.
   kdpQcLists.NOT_VARIANTS  closed words whose hyphenated form is another word
                            ("re-sign" is not "resign").
   kdpQcLists.LEFTOVERS     patterns of notes left in the text.
   kdpQcLists.HEALTH, MONEY words of a topic close to health or money, whole words.
   kdpQcLists.DISCLAIMER    phrases that count as a disclaimer in the text.
   kdpQcLists.COMMON_WORDS  words of 4 or more letters that are never "overused".
═══════════════════════════════════════════════════ */

(function (root) {
  const OUR = '- s ed ing';
  const IZE = 'e es ed ing er ers ation ations';

  const US_UK = [
    // -or / -our
    ['color', 'colour', `${OUR} ings ful fully less`],
    ['discolor', 'discolour', OUR],
    ['behavior', 'behaviour', '- s al ally'],
    ['misbehavior', 'misbehaviour', '-'],
    ['favor', 'favour', `${OUR} able ably ite ites`],
    ['flavor', 'flavour', `${OUR} ings ful less`],
    ['honor', 'honour', `${OUR} able ably`],
    ['dishonor', 'dishonour', OUR],
    ['humor', 'humour', `${OUR} less`],
    ['labor', 'labour', `${OUR} er ers`],
    ['neighbor', 'neighbour', '- s ing hood hoods ly'],
    ['rumor', 'rumour', '- s ed'],
    ['harbor', 'harbour', OUR],
    ['vapor', 'vapour', '- s'],
    ['armor', 'armour', '- ed y'],
    ['endeavor', 'endeavour', OUR],
    ['savor', 'savour', `${OUR} y`],
    ['odor', 'odour', '- s less'],
    ['vigor', 'vigour', '-'],
    ['rigor', 'rigour', '- s'],
    ['valor', 'valour', '-'],
    ['candor', 'candour', '-'],
    ['parlor', 'parlour', '- s'],
    ['clamor', 'clamour', OUR],
    ['tumor', 'tumour', '- s'],
    ['splendor', 'splendour', '-'],
    ['demeanor', 'demeanour', '-'],
    ['fervor', 'fervour', '-'],
    ['ardor', 'ardour', '-'],
    // -er / -re
    ['center', 'centre', '- s'],
    ['centered', 'centred', '-'],
    ['centering', 'centring', '-'],
    ['fiber', 'fibre', '- s'],
    ['liter', 'litre', '- s'],
    ['milliliter', 'millilitre', '- s'],
    ['kilometer', 'kilometre', '- s'],
    ['centimeter', 'centimetre', '- s'],
    ['millimeter', 'millimetre', '- s'],
    ['theater', 'theatre', '- s'],
    ['caliber', 'calibre', '-'],
    ['saber', 'sabre', '- s'],
    ['somber', 'sombre', '-'],
    ['specter', 'spectre', '- s'],
    ['luster', 'lustre', '-'],
    ['meager', 'meagre', '-'],
    ['maneuver', 'manoeuvre', '- s'],
    ['maneuvered', 'manoeuvred', '-'],
    ['maneuvering', 'manoeuvring', '-'],
    ['maneuverable', 'manoeuvrable', '-'],
    // one l / two l
    ['traveled', 'travelled', '-'],
    ['traveling', 'travelling', '-'],
    ['traveler', 'traveller', '- s'],
    ['canceled', 'cancelled', '-'],
    ['canceling', 'cancelling', '-'],
    ['labeled', 'labelled', '-'],
    ['labeling', 'labelling', '-'],
    ['modeled', 'modelled', '-'],
    ['modeling', 'modelling', '-'],
    ['fueled', 'fuelled', '-'],
    ['fueling', 'fuelling', '-'],
    ['leveled', 'levelled', '-'],
    ['leveling', 'levelling', '-'],
    ['counseled', 'counselled', '-'],
    ['counseling', 'counselling', '-'],
    ['counselor', 'counsellor', '- s'],
    ['signaled', 'signalled', '-'],
    ['signaling', 'signalling', '-'],
    ['totaled', 'totalled', '-'],
    ['totaling', 'totalling', '-'],
    ['dialed', 'dialled', '-'],
    ['dialing', 'dialling', '-'],
    ['marveled', 'marvelled', '-'],
    ['marveling', 'marvelling', '-'],
    ['marvelous', 'marvellous', '- ly'],
    ['jewelry', 'jewellery', '-'],
    ['jeweler', 'jeweller', '- s'],
    ['woolen', 'woollen', '- s'],
    ['quarreled', 'quarrelled', '-'],
    ['channeled', 'channelled', '-'],
    ['channeling', 'channelling', '-'],
    ['funneled', 'funnelled', '-'],
    ['shoveled', 'shovelled', '-'],
    ['shoveling', 'shovelling', '-'],
    ['paneled', 'panelled', '-'],
    ['paneling', 'panelling', '-'],
    ['equaled', 'equalled', '-'],
    ['equaling', 'equalling', '-'],
    ['fulfill', 'fulfil', '- ment'],
    ['fulfills', 'fulfils', '-'],
    ['enroll', 'enrol', '- ment ments'],
    ['enrolls', 'enrols', '-'],
    ['installment', 'instalment', '- s'],
    ['skillful', 'skilful', '- ly'],
    ['willful', 'wilful', '- ly'],
    ['instill', 'instil', '-'],
    ['instills', 'instils', '-'],
    ['distill', 'distil', '-'],
    ['distills', 'distils', '-'],
    // -ize / -ise
    ...['realiz', 'recogniz', 'organiz', 'reorganiz', 'apologiz', 'emphasiz', 'prioritiz', 'summariz', 'minimiz', 'maximiz', 'optimiz',
      'criticiz', 'memoriz', 'visualiz', 'utiliz', 'stabiliz', 'specializ', 'normaliz', 'personaliz', 'categoriz', 'characteriz',
      'customiz', 'finaliz', 'generaliz', 'harmoniz', 'hospitaliz', 'legaliz', 'mobiliz', 'moderniz', 'neutraliz', 'penaliz',
      'revitaliz', 'sympathiz', 'symboliz', 'synchroniz', 'energiz', 'economiz', 'equaliz', 'familiariz', 'fertiliz', 'formaliz',
      'capitaliz', 'authoriz', 'civiliz', 'coloniz', 'crystalliz', 'demoraliz', 'dramatiz', 'hypnotiz', 'idealiz', 'immuniz',
      'internaliz', 'jeopardiz', 'materializ', 'mechaniz', 'moisturiz', 'monetiz', 'nationaliz', 'ostraciz', 'patroniz', 'pasteuriz',
      'plagiariz', 'polariz', 'pressuriz', 'privatiz', 'publiciz', 'rationaliz', 'scrutiniz', 'sensitiz', 'socializ', 'steriliz',
      'subsidiz', 'tantaliz', 'terroriz', 'theoriz', 'trivializ', 'vaporiz', 'verbaliz', 'victimiz', 'vocaliz', 'weaponiz'
    ].map((s) => [s, `${s.slice(0, -1)}s`, IZE]),
    // "analyses" and "paralyses" are plural nouns in both spellings, so the -es form is left out.
    ['analyz', 'analys', 'e ed ing er ers'],
    ['paralyz', 'paralys', 'e ed ing'],
    ['catalyz', 'catalys', 'e ed ing'],
    // -ense
    ['defense', 'defence', '- s less'],
    ['offense', 'offence', '- s'],
    ['pretense', 'pretence', '- s'],
    // ae / oe
    ['estrogen', 'oestrogen', '-'],
    ['anemia', 'anaemia', '-'],
    ['anemic', 'anaemic', '-'],
    ['diarrhea', 'diarrhoea', '-'],
    ['hemoglobin', 'haemoglobin', '-'],
    ['hemorrhage', 'haemorrhage', '- s'],
    ['hemorrhoids', 'haemorrhoids', '-'],
    ['pediatric', 'paediatric', '-'],
    ['pediatrician', 'paediatrician', '- s'],
    ['orthopedic', 'orthopaedic', '- s'],
    ['fetus', 'foetus', '-'],
    ['fetal', 'foetal', '-'],
    ['esophagus', 'oesophagus', '-'],
    ['leukemia', 'leukaemia', '-'],
    ['edema', 'oedema', '-'],
    ['anesthetic', 'anaesthetic', '- s'],
    ['anesthesia', 'anaesthesia', '-'],
    ['gynecology', 'gynaecology', '-'],
    ['gynecologist', 'gynaecologist', '- s'],
    ['feces', 'faeces', '-'],
    ['cesarean', 'caesarean', '-'],
    ['celiac', 'coeliac', '-'],
    ['apnea', 'apnoea', '-'],
    ['encyclopedia', 'encyclopaedia', '- s'],
    // Others
    ['aging', 'ageing', '-'],
    ['aluminum', 'aluminium', '-'],
    ['artifact', 'artefact', '- s'],
    ['cozy', 'cosy', '-'],
    ['cozier', 'cosier', '-'],
    ['mustache', 'moustache', '- s'],
    ['pajamas', 'pyjamas', '-'],
    ['plow', 'plough', OUR],
    ['skeptic', 'sceptic', '- s al ally ism'],
    ['sulfur', 'sulphur', '-'],
    ['sulfate', 'sulphate', '- s'],
    ['yogurt', 'yoghurt', '- s'],
    ['math', 'maths', '-'],
    ['judgment', 'judgement', '- s al'],
    ['acknowledgment', 'acknowledgement', '- s'],
    ['likable', 'likeable', '-'],
    ['livable', 'liveable', '-'],
    ['lovable', 'loveable', '-'],
    ['sizable', 'sizeable', '-'],
    ['mold', 'mould', '- s ed ing y'],
    ['smolder', 'smoulder', OUR],
    ['licorice', 'liquorice', '-'],
    ['omelet', 'omelette', '- s'],
    ['chili', 'chilli', '-'],
    ['chilies', 'chillies', '-'],
    ['tidbit', 'titbit', '- s'],
    ['airplane', 'aeroplane', '- s'],
    ['mollusk', 'mollusc', '- s'],
    ['checkered', 'chequered', '-']
  ];

  const SPACE_VARIANTS = [
    ['health care', 'healthcare'],
    ['web site', 'website'],
    ['web page', 'webpage'],
    ['data base', 'database'],
    ['life style', 'lifestyle'],
    ['work place', 'workplace'],
    ['work book', 'workbook'],
    ['home work', 'homework'],
    ['week end', 'weekend'],
    ['mind set', 'mindset'],
    ['note book', 'notebook'],
    ['time line', 'timeline'],
    ['touch screen', 'touchscreen'],
    ['bed time', 'bedtime'],
    ['day time', 'daytime'],
    ['night time', 'nighttime'],
    ['head ache', 'headache'],
    ['heart beat', 'heartbeat'],
    ['well being', 'wellbeing']
  ];

  const NOUN_VERB = ['warm up', 'cool down', 'work out', 'set up', 'check in', 'check out', 'log in', 'sign up', 'back up', 'break down',
    'follow up', 'stand up', 'sit up', 'push up', 'pull up', 'wake up', 'start up', 'clean up', 'build up', 'roll out', 'try out'];

  const NOT_VARIANTS = ['resign', 'recover', 'recreate', 'release', 'repress', 'resent', 'reserve', 'resort', 'reform', 'recount', 'remark',
    'react', 'repair', 'retreat', 'recollect', 'resolve', 'refuse', 'retire', 'relay', 'restore', 'research', 'coop', 'unionized', 'present', 'depart'];

  // Case matters: "todo" and "tbd" in small letters are left alone, "[insert a photo]" any case.
  const LEFTOVERS = [
    /\[\s*TODO\b[^\]\n]*\]/g,
    /\bTODO:/g,
    /\bTBD\b/g,
    /\bXXX+\b/g,
    /\[\s*insert\b[^\]\n]*\]/gi,
    /\{\{[^}\n]*\}\}/g,
    /\[\s*citation needed\s*\]/gi,
    /\blorem\s+ipsum\b/gi
  ];

  const HEALTH = ['health', 'healthy', 'healthier', 'wellness', 'diet', 'diets', 'dieting', 'dietary', 'nutrition', 'pain', 'pains', 'weight',
    'obesity', 'sleep', 'insomnia', 'anxiety', 'depression', 'diabetes', 'diabetic', 'cholesterol', 'blood pressure', 'heart disease',
    'cancer', 'arthritis', 'pregnancy', 'pregnant', 'fertility', 'menopause', 'medication', 'medications', 'medicine', 'medical',
    'supplement', 'supplements', 'vitamin', 'vitamins', 'therapy', 'mental', 'fasting', 'keto', 'fitness', 'workout', 'workouts', 'yoga'];

  const MONEY = ['money', 'finance', 'finances', 'financial', 'invest', 'investing', 'investment', 'investments', 'investor', 'investors',
    'debt', 'debts', 'tax', 'taxes', 'retirement', 'pension', 'pensions', 'trading', 'stocks', 'crypto', 'cryptocurrency', 'bitcoin',
    'budgeting', 'savings', 'mortgage', 'mortgages', 'loan', 'loans', 'income', 'wealth'];

  const DISCLAIMER = ['not medical advice', 'not legal advice', 'not financial advice', 'not investment advice', 'not tax advice',
    'not a substitute for medical', 'not a substitute for professional', 'talk to your doctor', 'talk with your doctor',
    'speak to your doctor', 'speak with your doctor', 'ask your doctor', 'consult your doctor', 'consult a doctor', 'see your doctor',
    'consult a physician', 'consult your physician', 'consult a financial', 'talk to a financial', 'speak to a financial',
    'talk to a qualified', 'consult a qualified'];

  const COMMON_WORDS = (`about above across act acts actual actually add added adding adds after again against ago agree ahead allow allowed
    allows almost alone along already also although always among amount another answer answers anyone anything anyway anywhere apart appear
    area areas around arrive asked asking asks aside attention away back backs based basic became because become becomes becoming been
    before began begin beginning begins behind being believe believed believes below beside best better between beyond bigger biggest bit bits
    body bodies book books both bring brings brought build building builds built business busy call called calling calls came cannot
    care cares carried carry case cases cause caused causes certain chance chances change changed changes changing chapter chapters
    check checks choice choices choose chooses chosen clear clearly close closed closer come comes coming common compare complete
    completely consider could couldn't count counts couple course cover covers create created creates creating current
    daily data date days dear decide decided decides decision decisions deep deeper did didn't differ difference differences different
    difficult direct directly does doesn't doing done don't down during each earlier early easier easily easy eight either else
    empty end ended ending ends enough entire especially even event events ever every everyone everything everywhere exactly
    example examples except expect expected expects experience explain explains extra face faces fact facts fairly fall falls
    family fast feel feeling feelings feels feet fell felt few fewer field fifth figure file fill final finally find finding finds fine
    finish finished first fit fits five flat follow followed following follows food force form forms forward found four fourth free
    friend friends from front full fully further future gain gave general generally get gets getting give given gives giving goal goals
    goes going gone good got great greater group groups grow growing grows guess guide habit had half hand hands happen happened
    happens hard harder has have having head heads hear heard help helped helpful helping helps here high higher hold holds home
    hope hour hours house however huge idea ideas important improve include included includes including indeed inside instead
    interest into issue issues item items itself job jobs join just keep keeping keeps kept kind kinds knew know knowing known knows
    lack large larger last late later lead leads learn learned learning least leave leaves left less let let's lets letter level levels
    life light like liked likely likes limit line lines list listen little live lived lives living long longer look looked looking looks
    lose loses losing lost lot lots love low lower made main mainly major make makes making many mark matter matters may maybe mean
    meaning means meant meet meets mention might mind minds mine minute minutes miss mistake mistakes modern moment moments month months
    more morning most mostly move moved moves moving much must myself name names near nearly need needed needs never new newer next
    nice night nine nobody none nor normal normally note notes nothing notice now number numbers obvious occur offer offers often okay
    old older once one ones only onto open opened opens opposite option options order other others otherwise ought our ours ourselves
    out outside over overall own page pages paper part parts particular particularly pass passed past path pattern patterns pay
    people perhaps period person personal pick picked picks picture piece pieces place placed places plan plans play plays plus point
    points possible power practical practice practices prefer prepare present pretty previous probably problem problems process
    produce program project proper provide provides pull purpose push put puts quality question questions quick quickly quiet quite
    rarely rather reach reached reaches read reader readers reading reads ready real really reason reasons recent record reduce
    regular regularly relate remain remember remind remove repeat reply require requires rest result results return review right rise
    risk road role room rule rules run running runs safe said same save saw say saying says second seconds section sections see
    seeing seem seemed seems seen sees self sell send sense sent series serious set sets setting seven several shall shape share she
    short should shouldn't show showed showing shown shows side sides sign signs similar simple simply since single sit site sits
    situation six size skill skills slightly slow slowly small smaller some somebody someone something sometimes somewhere soon
    sort sorts sound sounds source sources space speak special specific spend spent stage stand standard stands start started starting
    starts state states stay stayed staying stays step steps still stop stopped stops story straight strong stronger study stuff
    subject such suggest suppose sure surprise take taken takes taking talk talking talks task tasks teach tell telling tells ten
    tend tends term terms test than thank thanks that that's the their theirs them themselves then there there's therefore these they
    they're thing things think thinking thinks third this those though thought thoughts thousand three through throughout thus
    tiny tips today together told tomorrow tonight took tool tools top total touch toward towards track tried tries true truly try
    trying turn turned turning turns twice two type types under understand understanding unless until unusual upon use used useful
    uses using usual usually value values various very view visit wait walk walks want wanted wants was wasn't watch water way ways
    wear week weekly weeks well went were weren't what what's whatever when whenever where wherever whether which while white who
    whole whom whose why wide will win wish with within without woman women won't wonder word words work worked working works world
    worry worse worst worth would wouldn't write writer writing written wrong wrote year years yes yesterday yet you you're you've
    young your yours yourself`).split(/\s+/);

  root.kdpQcLists = { US_UK, SPACE_VARIANTS, NOUN_VERB, NOT_VARIANTS, LEFTOVERS, HEALTH, MONEY, DISCLAIMER, COMMON_WORDS };
})(globalThis);
