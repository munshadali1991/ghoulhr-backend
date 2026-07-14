const SKIP_HELPER = 'Skip if not applicable to you';

interface DefaultQuestionDef {
  key: string;
  label: string;
  type: string;
  required: boolean;
  allowComment: boolean;
  sortOrder: number;
  isActive: boolean;
  options?: string[];
  helperText?: string;
  placeholder?: string;
}

interface DefaultSectionDef {
  key: string;
  title: string;
  banner: string | null;
  role: string;
  scored: boolean;
  sortOrder: number;
  isActive: boolean;
  questions: DefaultQuestionDef[];
}

const KPI_LABELS = [
  'Approach towards work: Follows instruction',
  'Approach towards work: Adaptable & Flexible',
  'Approach towards work: Ability to Plan',
  'Technical skills: Ability to Learn new skills / Technology',
  'Technical skills: Job Knowledge',
  'Technical skills: Skill to handle Work',
  'Quality of work: Accuracy',
  'Quality of work: Reliability',
  'Quality of work: Client Satisfaction',
  'Handling Target: Ability to work under pressure',
  'Handling Target: Completion of work on - time',
  'Interpersonal skills: Relationship with Colleagues',
  'Interpersonal skills: Problem Solving',
  'Interpersonal skills: Decision Making',
  'Interpersonal skills: Time Management',
  'Communication skills: Oral expression',
  'Communication skills: Written expression',
  'Communication skills: Share information with in Team',
  'Willingness & Development: Open to ideas',
  'Personality: Enthusiastic',
  'Personality: Trustworthy',
  'Code of conduct: Work Place Etiquette',
  'Code of conduct: Punctuality',
  'Code of conduct: Discipline',
  'Leadership: Team Work',
  'Leadership: Team Building',
  'Leadership: New strategy & Direction',
];

const KPI_KEYS = [
  'q10', 'q11', 'q12', 'q13', 'q14', 'q15', 'q16', 'q17', 'q18', 'q19',
  'q20', 'q21', 'q22', 'q23', 'q24', 'q25', 'q26', 'q27', 'q28', 'q29',
  'q30', 'q31', 'q32', 'q33', 'q34', 'q35', 'q36',
];

/** Default org master ported from the legacy frontend assessmentSchema.js. */
export const PERFORMANCE_DEFAULT_MASTER: {
  ratingOptions: Array<{
    label: string;
    weight: number;
    sortOrder: number;
    isActive: boolean;
  }>;
  sections: DefaultSectionDef[];
} = {
  ratingOptions: [
    { label: 'OUTSTANDING', weight: 5, sortOrder: 0, isActive: true },
    { label: 'EXCELLENT', weight: 4, sortOrder: 1, isActive: true },
    { label: 'GOOD', weight: 3, sortOrder: 2, isActive: true },
    { label: 'AVERAGE', weight: 2, sortOrder: 3, isActive: true },
    { label: 'NEEDS IMPROVEMENT', weight: 1, sortOrder: 4, isActive: true },
  ],
  sections: [
    {
      key: 'qualitative',
      title: 'Self Reflection',
      banner: null,
      role: 'EMPLOYEE',
      scored: false,
      sortOrder: 0,
      isActive: true,
      questions: [
        {
          key: 'q1',
          label: 'List down your current roles and responsibilities.',
          type: 'narrative',
          required: true,
          allowComment: false,
          sortOrder: 0,
          isActive: true,
        },
        {
          key: 'q2',
          label:
            'Please list what you enjoyed most about working with the organization over the last twelve months.',
          type: 'narrative',
          required: true,
          allowComment: false,
          sortOrder: 1,
          isActive: true,
        },
        {
          key: 'q3',
          label:
            'What have been your main achievements over the last twelve months with the organization?',
          type: 'narrative',
          required: true,
          allowComment: false,
          sortOrder: 2,
          isActive: true,
        },
        {
          key: 'q4',
          label:
            'What were the most significant challenges you faced in your role over the last twelve months? What assistance do you believe we need to help you with these challenges?',
          type: 'narrative',
          required: true,
          allowComment: false,
          sortOrder: 3,
          isActive: true,
        },
        {
          key: 'q5',
          label:
            'In last 12 months, as per you, what didn\u2019t go well (as expected) and what could you have done better?',
          type: 'narrative',
          required: true,
          allowComment: false,
          sortOrder: 4,
          isActive: true,
        },
        {
          key: 'q6',
          label:
            'What are your career aspirations with the organization in the longer term i.e. 2+ years?',
          type: 'narrative',
          required: true,
          allowComment: false,
          sortOrder: 5,
          isActive: true,
        },
        {
          key: 'q7',
          label:
            'List down the names of the project where you have worked in the last 12 months, along with the duration.',
          type: 'narrative',
          required: true,
          allowComment: true,
          sortOrder: 6,
          isActive: true,
        },
        {
          key: 'q8',
          label:
            'List down skills/competencies you have acquired in the past 12 months?',
          type: 'narrative',
          required: true,
          allowComment: true,
          sortOrder: 7,
          isActive: true,
        },
      ],
    },
    {
      key: 'kpi',
      title: 'KPI Section',
      banner: 'KPI Section',
      role: 'EMPLOYEE',
      scored: true,
      sortOrder: 1,
      isActive: true,
      questions: KPI_KEYS.map((key, index) => ({
        key,
        label: KPI_LABELS[index],
        type: 'rating',
        required: true,
        allowComment: true,
        sortOrder: index,
        isActive: true,
      })),
    },
    {
      key: 'quantitative',
      title: 'Learning & Development',
      banner: null,
      role: 'EMPLOYEE',
      scored: false,
      sortOrder: 2,
      isActive: true,
      questions: [
        {
          key: 'q37',
          label: 'How many Trailhead Badges have you earned?',
          type: 'number',
          required: false,
          allowComment: false,
          helperText: SKIP_HELPER,
          placeholder: 'Enter any number',
          sortOrder: 0,
          isActive: true,
        },
        {
          key: 'q38',
          label: 'How many workshops have you attended?',
          type: 'number',
          required: false,
          allowComment: false,
          helperText: SKIP_HELPER,
          placeholder: 'Enter any number',
          sortOrder: 1,
          isActive: true,
        },
        {
          key: 'q39',
          label:
            'Mention the workshop name you have attended and your takeaway from it.',
          type: 'text',
          required: false,
          allowComment: false,
          helperText: SKIP_HELPER,
          sortOrder: 2,
          isActive: true,
        },
        {
          key: 'q40',
          label:
            'Did you get an opportunity to upscale any resource like (Trainee / Associates / new Joiner / Junior Resources) in the last 12 months? If yes, please provide details along with the resource name.',
          type: 'text',
          required: false,
          allowComment: true,
          helperText: SKIP_HELPER,
          placeholder: 'Enter your response...',
          sortOrder: 3,
          isActive: true,
        },
      ],
    },
    {
      key: 'manager',
      title: 'Manager Review',
      banner: 'Only for Manager to fill and communicate',
      role: 'MANAGER',
      scored: false,
      sortOrder: 3,
      isActive: true,
      questions: [
        {
          key: 'q42',
          label: 'New / Additional roles and responsibilities',
          type: 'text',
          required: false,
          allowComment: false,
          sortOrder: 0,
          isActive: true,
        },
        {
          key: 'q43',
          label:
            'Please provide Overall Rating between (A+, A, B+, B, C) along with your comments',
          type: 'select',
          options: ['A+', 'A', 'B+', 'B', 'C'],
          required: false,
          allowComment: true,
          sortOrder: 1,
          isActive: true,
        },
      ],
    },
    {
      key: 'hr',
      title: 'HR Feedback',
      banner: 'Only for HR to fill and Communicate',
      role: 'HR',
      scored: false,
      sortOrder: 4,
      isActive: true,
      questions: [
        {
          key: 'q49',
          label:
            'Suggestion on areas of Improvement for Employee (If any) / HR Feedback',
          type: 'text',
          required: false,
          allowComment: false,
          sortOrder: 0,
          isActive: true,
        },
      ],
    },
  ],
};
