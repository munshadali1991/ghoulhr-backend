export type DefaultSkillCatalog = {
  name: string;
  subcategories: { name: string; skills: string[] }[];
};

export const DEFAULT_SKILL_CATALOG: DefaultSkillCatalog[] = [
  {
    name: 'Software Development',
    subcategories: [
      {
        name: 'Frontend',
        skills: ['React', 'JavaScript', 'TypeScript', 'HTML/CSS'],
      },
      {
        name: 'Backend',
        skills: ['Node.js', 'Python', 'Java', '.NET'],
      },
      {
        name: 'Database',
        skills: ['PostgreSQL', 'MySQL', 'MongoDB'],
      },
    ],
  },
  {
    name: 'Design',
    subcategories: [
      {
        name: 'UI/UX',
        skills: ['Figma', 'Adobe XD'],
      },
      {
        name: 'Visual',
        skills: ['Photoshop', 'Illustrator'],
      },
    ],
  },
  {
    name: 'Marketing',
    subcategories: [
      {
        name: 'Digital',
        skills: ['SEO', 'Google Ads'],
      },
      {
        name: 'Content',
        skills: ['Copywriting'],
      },
    ],
  },
  {
    name: 'Soft Skills',
    subcategories: [
      {
        name: 'Communication',
        skills: ['Presentation', 'Written Communication'],
      },
      {
        name: 'Leadership',
        skills: ['Team Leadership', 'Mentoring'],
      },
    ],
  },
];
