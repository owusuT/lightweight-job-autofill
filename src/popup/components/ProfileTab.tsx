import type { Profile } from "../../shared/types";

interface Props {
  profile: Profile;
  onChange: (key: keyof Profile, value: string) => void;
  onToggle: (key: keyof Profile, value: boolean) => void;
  onSave: () => void;
  onClear: () => void;
}

interface FieldDef {
  key: keyof Profile;
  label: string;
  placeholder?: string;
  type?: string;
  rows?: number;
  opts?: [string, string][];
}

const YES_NO: [string, string][] = [
  ["", "Select…"],
  ["Yes", "Yes"],
  ["No", "No"],
];

const SECTIONS: { title: string; rows: FieldDef[][] }[] = [
  {
    title: "Personal",
    rows: [
      [
        { key: "firstName", label: "First Name", placeholder: "Jane" },
        { key: "lastName", label: "Last Name", placeholder: "Smith" },
      ],
      [
        { key: "email", label: "Email", placeholder: "jane@email.com", type: "email" },
        { key: "phone", label: "Phone", placeholder: "(555) 000-0000", type: "tel" },
      ],
    ],
  },
  {
    title: "Address",
    rows: [
      [{ key: "address", label: "Street Address", placeholder: "123 Main St" }],
      [{ key: "address2", label: "Address Line 2", placeholder: "Apt, suite, unit (optional)" }],
      [
        { key: "city", label: "City", placeholder: "Raleigh" },
        { key: "state", label: "State", placeholder: "NC" },
        { key: "zip", label: "ZIP", placeholder: "27601" },
      ],
      [{ key: "country", label: "Country", placeholder: "United States" }],
    ],
  },
  {
    title: "Professional",
    rows: [
      [{ key: "summary", label: "Professional Summary", placeholder: "Brief overview of your experience and goals…", rows: 3 }],
      [{ key: "skills", label: "Skills", placeholder: "Python, SQL, Project Management…", rows: 2 }],
      [{ key: "experience", label: "Experience", placeholder: "Roles, employers, and dates", rows: 3 }],
      [
        { key: "position", label: "Current/Target Role", placeholder: "IT Analyst" },
        { key: "company", label: "Current Company", placeholder: "Acme Corp" },
      ],
      [
        { key: "salary", label: "Desired Salary", placeholder: "75000" },
        { key: "industry", label: "Industry", placeholder: "Information Technology" },
      ],
      [
        { key: "linkedin", label: "LinkedIn URL", placeholder: "linkedin.com/in/…", type: "url" },
        { key: "website", label: "Portfolio / Website", placeholder: "yoursite.com", type: "url" },
      ],
      [{ key: "education", label: "Education", placeholder: "BS Information Technology, NCSU" }],
      [
        {
          key: "availability",
          label: "Availability",
          opts: [
            ["", "Select…"],
            ["Immediate", "Immediate"],
            ["2 weeks", "2 Weeks"],
            ["1 month", "1 Month"],
            ["3 months", "3 Months"],
          ],
        },
        {
          key: "workType",
          label: "Work Type",
          opts: [
            ["", "Select…"],
            ["On-site", "On-site"],
            ["Remote", "Remote"],
            ["Hybrid", "Hybrid"],
          ],
        },
      ],
    ],
  },
  {
    title: "Eligibility & Legal",
    rows: [
      [
        {
          key: "workAuthorization",
          label: "Work Authorization",
          opts: [
            ["", "Select…"],
            ["Yes", "Authorized to work"],
            ["No", "Not authorized"],
          ],
        },
        { key: "sponsorshipNeeded", label: "Sponsorship Needed", opts: YES_NO },
      ],
      [
        {
          key: "ageConfirmed",
          label: "18+ Confirmation",
          opts: [
            ["", "Select…"],
            ["Yes", "Yes, I am 18 or older"],
            ["No", "No"],
          ],
        },
        {
          key: "employmentType",
          label: "Employment Type",
          opts: [
            ["", "Select…"],
            ["Full-time", "Full-time"],
            ["Part-time", "Part-time"],
            ["Contract", "Contract"],
            ["Internship", "Internship"],
            ["Freelance", "Freelance"],
          ],
        },
      ],
      [
        { key: "startDate", label: "Available Start Date", placeholder: "e.g. 2026-09-01" },
        { key: "relocate", label: "Willing to Relocate", opts: YES_NO },
      ],
      [
        {
          key: "travel",
          label: "Travel Willingness",
          opts: [
            ["", "Select…"],
            ["None", "None"],
            ["Up to 25%", "Up to 25%"],
            ["Up to 50%", "Up to 50%"],
            ["Up to 75%", "Up to 75%"],
            ["Up to 100%", "Up to 100%"],
          ],
        },
        { key: "yearsExperience", label: "Years of Experience", placeholder: "e.g. 5+" },
      ],
      [{ key: "certifications", label: "Certifications", placeholder: "Comma separated, e.g. PMP, AWS Solutions Architect" }],
    ],
  },
  {
    title: "EEO (Voluntary — optional)",
    rows: [
      [
        {
          key: "gender",
          label: "Gender",
          opts: [
            ["", "Select…"],
            ["Female", "Female"],
            ["Male", "Male"],
            ["Non-binary", "Non-binary"],
            ["Prefer not to say", "Prefer not to say"],
          ],
        },
        {
          key: "race",
          label: "Race / Ethnicity",
          opts: [
            ["", "Select…"],
            ["American Indian or Alaska Native", "American Indian or Alaska Native"],
            ["Asian", "Asian"],
            ["Black or African American", "Black or African American"],
            ["Hispanic or Latino", "Hispanic or Latino"],
            ["Native Hawaiian or Pacific Islander", "Native Hawaiian or Pacific Islander"],
            ["White", "White"],
            ["Two or more races", "Two or more races"],
            ["Prefer not to say", "Prefer not to say"],
          ],
        },
      ],
      [
        {
          key: "veteranStatus",
          label: "Veteran Status",
          opts: [
            ["", "Select…"],
            ["Yes", "I am a veteran"],
            ["No", "I am not a veteran"],
            ["Prefer not to say", "Prefer not to say"],
          ],
        },
        {
          key: "disabilityStatus",
          label: "Disability Status",
          opts: [
            ["", "Select…"],
            ["Yes", "I have a disability"],
            ["No", "I do not have a disability"],
            ["Prefer not to say", "Prefer not to say"],
          ],
        },
      ],
    ],
  },
  {
    title: "Application Details",
    rows: [
      [{ key: "coverLetter", label: "Cover Letter", placeholder: "Paste your cover letter text here…", rows: 3 }],
      [{ key: "whyInterested", label: "Why Are You Interested?", placeholder: "Optional short answer used when applications ask for interest…", rows: 2 }],
      [
        { key: "referralSource", label: "Referral Source", placeholder: "e.g. LinkedIn, Indeed, Employee Referral" },
        { key: "referredBy", label: "Referred By", placeholder: "Name of referrer (optional)" },
      ],
      [{ key: "references", label: "References", placeholder: "Name — Relationship — Contact (one per line)", rows: 2 }],
      [
        { key: "referenceName", label: "Reference Name", placeholder: "Jane Doe" },
        { key: "referenceRelationship", label: "Reference Relationship", placeholder: "e.g. Manager" },
      ],
      [{ key: "referenceContact", label: "Reference Contact", placeholder: "email or phone" }],
    ],
  },
];

const CONSENTS: { key: keyof Profile; label: string }[] = [
  { key: "consentBackgroundCheck", label: "Background check consent" },
  { key: "consentDrugScreening", label: "Drug screening consent" },
  { key: "consentSignature", label: "Electronic signature / attestation" },
  { key: "consentTerms", label: "Terms & conditions agreement" },
];

function Field({ field, value, onChange }: { field: FieldDef; value: string; onChange: (key: keyof Profile, value: string) => void }) {
  const id = `profile-${field.key}`;
  return (
    <div className="form-group">
      <label htmlFor={id}>{field.label}</label>
      {field.opts ? (
        <select id={id} value={value} onChange={(e) => onChange(field.key, e.target.value)}>
          {field.opts.map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      ) : field.rows ? (
        <textarea
          id={id}
          rows={field.rows}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      ) : (
        <input
          id={id}
          type={field.type || "text"}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      )}
    </div>
  );
}

export function ProfileTab({ profile, onChange, onToggle, onSave, onClear }: Props) {
  return (
    <div>
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <div className="section-title">{section.title}</div>
          {section.rows.map((row, index) => (
            <div className="form-row" key={index}>
              {row.map((field) => (
                <Field
                  key={field.key}
                  field={field}
                  value={String(profile[field.key] ?? "")}
                  onChange={onChange}
                />
              ))}
            </div>
          ))}
        </div>
      ))}

      <div className="section-title">Consent — Fill Only When Checked</div>
      <div className="checkbox-group">
        {CONSENTS.map((item) => (
          <label className="checkbox-label" key={item.key}>
            <input
              type="checkbox"
              checked={Boolean(profile[item.key])}
              onChange={(e) => onToggle(item.key, e.target.checked)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      <p className="muted-note">
        These are never auto-checked on a job page. Only the consent items you enable here
        will be confirmed during autofill.
      </p>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={onSave}>Save Profile</button>
        <button className="btn btn-secondary" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}
