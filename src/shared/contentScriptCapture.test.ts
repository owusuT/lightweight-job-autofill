import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
// @ts-expect-error jsdom v24 ships no bundled types
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'contentScript.js'), 'utf8');

interface CapturedJob {
  title?: string;
  company?: string;
  location?: string;
  url?: string;
  ageLabel?: string;
  salary?: string;
  description?: string;
  postedAt?: number;
  remote?: boolean;
}

interface CaptureResponse {
  success: boolean;
  job?: CapturedJob;
  jobs?: CapturedJob[];
  error?: string;
}

type Listener = (
  message: { type: string },
  sender: unknown,
  sendResponse: (response: CaptureResponse) => void
) => void;

async function capture(html: string, url: string): Promise<CaptureResponse> {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const listeners: Listener[] = [];

  window.chrome = {
    runtime: {
      onMessage: { addListener: (fn: Listener) => listeners.push(fn) },
      sendMessage: (_message: unknown, callback?: (response: unknown) => void) => {
        callback?.({ success: true });
      },
      getURL: (path: string) => `chrome-extension://test/${path}`,
      connect: () => ({
        onDisconnect: { addListener: () => {} },
        onMessage: { addListener: () => {} },
        postMessage: () => {},
        disconnect: () => {},
      }),
      lastError: undefined,
    },
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      sync: { get: async () => ({}), set: async () => {} },
    },
  };

  window.eval(source);

  for (let attempt = 0; attempt < 20 && listeners.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (listeners.length === 0) throw new Error('content script never registered a message listener');

  let response: CaptureResponse = { success: false };
  listeners[0]({ type: 'CAPTURE_JOB' }, {}, (value) => {
    response = value;
  });
  dom.window.close();
  return response;
}

const linkedInCard = `
  <main>
    <ul>
      <li class="scaffold-layout__list-item">
        <div class="job-card-container b6bayf" data-view-name="job-card">
          <button aria-label="Dismiss Data &amp; Analytics Engineer job" class="b6blvb">×</button>
          <a href="/jobs/view/4401234567/?eBP=abc&amp;trackingId=xyz">
            <p class="b6bayf">
              <span class="b6blvb">Data &amp; Analytics Engineer</span>
              <span aria-hidden="true">Data &amp; Analytics Engineer <svg></svg></span>
            </p>
          </a>
          <p class="b6bayf">JMP USA</p>
          <p class="b6bayf">Greensboro--Winston-Salem--High Point Area (Hybrid)</p>
          <p class="b6bayf">Posted 6 days ago</p>
          <p class="b6bayf">9 benefits</p>
        </div>
      </li>
    </ul>
  </main>
`;

const linkedInCards = `
  <main>
    <ul>
      <li class="scaffold-layout__list-item">
        <div class="job-card-container b6bayf" data-view-name="job-card">
          <button aria-label="Dismiss Data &amp; Analytics Engineer job" class="b6blvb">×</button>
          <a href="/jobs/view/4401234567/?eBP=abc&amp;trackingId=xyz">
            <p class="b6bayf">
              <span class="b6blvb">Data &amp; Analytics Engineer</span>
              <span aria-hidden="true">Data &amp; Analytics Engineer <svg></svg></span>
            </p>
          </a>
          <p class="b6bayf">JMP USA</p>
          <p class="b6bayf">Greensboro--Winston-Salem--High Point Area (Hybrid)</p>
          <p class="b6bayf">Posted 6 days ago</p>
        </div>
      </li>
      <li class="scaffold-layout__list-item">
        <div class="job-card-container b6bayf" data-view-name="job-card">
          <button aria-label="Dismiss Backend Developer job" class="b6blvb">×</button>
          <a href="/jobs/view/4407654321/">
            <p class="b6bayf">
              <span class="b6blvb">Backend Developer</span>
              <span aria-hidden="true">Backend Developer <svg></svg></span>
            </p>
          </a>
          <p class="b6bayf">Acme Corp</p>
          <p class="b6bayf">Remote</p>
          <p class="b6bayf">Posted 2 days ago</p>
        </div>
      </li>
    </ul>
  </main>
`;

const linkedInLinklessCard = `
  <main>
    <div class="djel3q djeivq djeayx djeium djej1s djej07 djej1i djeixa djel3k">
      <div class="djeayx djeiu2 djej1s djej05 djej1i djeiyu djel3k">
        <div class="djel3q djeivq djeayx djeium djej1s djej07 djej1i djeixa djel3k">
          <div class="djel3q djeayx djeium djej1s djej07 djej1i djeixa djel3k">
            <div class="djeayp djel3k" data-display-contents="true">
              <p class="djeljd djelot djelir djegm5 djeljb djelq9 djelrd">
                <span class="djea2x djel3k">Bioinformatician II Cancer Center (Verified job)</span>
                <span aria-hidden="true">Bioinformatician II Cancer Center<span class="djelja djel3k"> </span></span>
              </p>
            </div>
            <div class="djelb9 djeayx djeiu2 djej1s djej07 djej1j djeixa djel3k">
              <p class="djeljd djeloo djelir djegoi djeljb djelq8">Atrium Health Wake Forest Baptist</p>
            </div>
            <p class="djeljd djeloo djelb9 djelir djegpo djeljb djelq8">Winston-Salem, NC (On-site)</p>
          </div>
        </div>
        <div class="djeayx djeiu2 djej1s djej02 djej1i djeiym djel3k">
          <button type="button" componentkey="auto-component-84d256d0-baf5-43df-811c-7057bda7c6a6" aria-label="Dismiss Bioinformatician II Cancer Center job">
            <span><svg></svg></span>
          </button>
        </div>
      </div>
      <div class="djel3q djelca djeayx djeium djej1s djej07 djej1i djeix6 djeia6 djel3k">
        <div class="djelb9 djelcq djeayx djeiu2 djej1s djej02 djej1i djeix6 djel3k"><figure aria-hidden="true"><svg></svg><img alt="" src="https://media.licdn.com/image.jpg"></figure><div class="djeivq djelir djegpo djeljb"><p class="djeljd djelom"><span>1 connection works here</span></p></div></div><div class="djeayx djeiu2 djej1s djej02 djej1j djeixa djel3k"><p class="djeljd djelom"><span class="djea2x djel3k">Posted 1 week ago</span><span aria-hidden="true">1 week ago</span></p></div>
      </div>
    </div>
  </main>
`;

const linkedInSearchWithDetail = `
  <main>
    <section>
      <h1>Selected Role</h1>
      <a href="https://www.linkedin.com/company/acme">Acme</a>
      <div id="job-details">Selected role description.</div>
    </section>
    <ul>
      <li class="scaffold-layout__list-item">
        <div class="job-card-container">
          <button aria-label="Dismiss Card Job job">×</button>
          <a href="/jobs/view/4401234567/">
            <p><span>Card Job</span><span aria-hidden="true">Card Job</span></p>
          </a>
          <p>Card Company</p>
          <p>Greensboro, NC (Hybrid)</p>
          <p>Posted 2 days ago</p>
        </div>
      </li>
    </ul>
  </main>
`;

const linkedInListItemCard = `
  <main>
    <ul>
      <li data-occludable-job-id="4499999999">
        <div>
          <div>
            <p><span>List Only Job</span><span aria-hidden="true">List Only Job</span></p>
            <p>List Company</p>
            <p>Raleigh, NC (On-site)</p>
          </div>
          <button aria-label="Dismiss List Only Job job">×</button>
        </div>
      </li>
    </ul>
  </main>
`;

const indeedCards = `
  <div data-testid="slider_item">
    <div class="job_seen_beacon">
      <h3 class="jobTitle">
        <a data-jk="aaa111" class="jcs-JobTitle" href="/rc/clk?jk=aaa111"><span title="Data Analyst">Data Analyst</span></a>
      </h3>
      <span data-testid="company-name">Acme Corp</span>
      <div data-testid="text-location"><span>Greensboro, NC</span></div>
    </div>
  </div>
  <div data-testid="slider_item">
    <div class="job_seen_beacon">
      <h3 class="jobTitle">
        <a data-jk="bbb222" class="jcs-JobTitle" href="/rc/clk?jk=bbb222"><span title="QA Engineer">QA Engineer</span></a>
      </h3>
      <span data-testid="company-name">Beta Inc</span>
      <div data-testid="text-location"><span>Remote</span></div>
    </div>
  </div>
`;

const indeedApplyButton = `
  <div class="css-g5y9jx" data-testid="primary-apply-action">
    <div class="css-g5y9jx">
      <a href="https://smartapply.indeed.com/beta/indeedapply/applybyapplyablejobid?indeedApplyableJobId=b75debae-7ac9-46f1-8c16-d2f744d41787&amp;iaUid=1k6ctppkpl51f801"
         rel="nofollow" role="link" tabindex="0" class="css-g5y9jx r-1loqt21 r-1otgn73" data-testid="viewjob-indeed-apply">
        <div class="css-g5y9jx"><div class="css-g5y9jx"><div dir="ltr" class="css-146c3p1 r-1xnzce8">Apply now</div></div></div>
      </a>
    </div>
  </div>
`;

  const genericApplyButton = `
  <main>
    <h1>Data Engineer</h1>
    <a href="https://jobs.example.com/apply/123">Apply now</a>
  </main>
`;

const glassdoorCards = `
  <div class="JobCard_jobCardWrapper__abc">
    <a data-test="job-title" href="/job-listing/enterprise-systems-administrator-JV_KO0,32.htm?jl=1010294393585">Enterprise Systems Administrator</a>
    <div data-test="employer-name">DoiT</div>
    <div data-test="emp-location">Remote</div>
    <div data-test="job-age">18d</div>
  </div>
  <div class="JobCard_jobCardWrapper__def">
    <a data-test="job-title" href="/job-listing/support-engineer-JV_KO0,32.htm?jl=1010294393590">Support Engineer</a>
    <div data-test="employer-name">Acme Corp</div>
    <div data-test="emp-location">Greensboro, NC</div>
    <div data-test="job-age">2d</div>
  </div>
`;

const linkedInDetail = `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "title": "Data & Analytics Engineer",
    "datePosted": "2026-10-26T00:00:00Z",
    "hiringOrganization": { "@type": "Organization", "name": "JMP USA" },
    "jobLocation": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Greensboro",
        "addressRegion": "NC"
      }
    },
    "jobLocationType": "TELECOMMUTE",
    "baseSalary": {
      "@type": "MonetaryAmount",
      "currency": "USD",
      "value": { "@type": "QuantitativeValue", "minValue": 90000, "maxValue": 120000, "unitText": "YEAR" }
    },
    "description": "<p>Build <b>dashboards</b>.</p>"
  }
  </script>
  <main>
    <button aria-label="Dismiss Data &amp; Analytics Engineer job">×</button>
    <h1>
      <span>Data &amp; Analytics Engineer</span>
      <span aria-hidden="true">Data &amp; Analytics Engineer</span>
    </h1>
    <div class="job-details-jobs-unified-top-card__primary-description-container">
      <a href="https://www.linkedin.com/company/jmp-usa">JMP USA</a> · Greensboro, NC · 2 days ago
    </div>
    <time datetime="2026-10-30"></time>
    <div id="job-details">Build dashboards.</div>
  </main>
`;

const indeedCard = `
  <div class="cardOutline tapItem result job_e86302b36583b276 resultWithShelf sponTapItem desktop">
    <div class="slider_container" data-testid="slider_container">
      <div class="slider_list">
        <div data-testid="slider_item" class="slider_item">
          <div class="job_seen_beacon">
            <table class="mainContentTable"><tbody><tr><td class="resultContent">
              <h3 class="jobTitle">
                <a id="job_e86302b36583b276" data-jk="e86302b36583b276" role="button"
                   aria-label="full details of Data Analyst and Developer" class="jcs-JobTitle"
                   href="/rc/clk?jk=e86302b36583b276&amp;from=hp.jobsForYou&amp;tk=1k6ci8lv3i94q805">
                  <span title="Data Analyst and Developer" id="jobTitle-e86302b36583b276">Data Analyst and Developer</span>
                </a>
              </h3>
              <div class="company_location">
                <span data-testid="company-name">Carolina Biological</span>
                <div data-testid="text-location">
                  <div><span data-testid="jcs-commute-snippet">25 min</span></div>
                  <div>·</div>
                  <span>Whitsett, NC</span>
                </div>
              </div>
            </td></tr></tbody></table>
          </div>
        </div>
      </div>
    </div>
  </div>
`;

const indeedDetail = `
  <h1 class="jobsearch-JobInfoHeader-title"><span>Data Engineer</span></h1>
  <div data-testid="inlineHeader-companyName"><a>JMP USA</a></div>
  <div data-testid="inlineHeader-companyLocation">Greensboro, NC</div>
  <div id="salaryInfoAndJobType">$90,000 - $120,000 a year</div>
  <div id="jobDescriptionText">Build <b>pipelines</b>.</div>
  <span data-testid="myJobsStateDate">Posted 3 days ago</span>
  <link rel="canonical" href="https://www.indeed.com/viewjob?jk=abc123&amp;from=serp" />
`;

const noJob = `<main><p>About us</p></main>`;

const glassdoorCard = `
  <div class="JobCard_jobCardWrapper__abc">
    <a data-test="job-title" href="/job-listing/enterprise-systems-administrator-JV_KO0,32.htm?jl=1010294393585">Enterprise Systems Administrator</a>
    <div data-test="employer-name">DoiT</div>
    <div data-test="emp-location">Remote</div>
    <div data-test="job-age">18d</div>
    <div class="SalaryEstimate_salaryEstimateNumber__xyz">
      <span class="SalaryEstimate_medianEstimate__123">£51k</span>
      <span class="SalaryEstimate_payPeriod__456">/yr Median</span>
    </div>
    <div data-test="jobDescriptionContent">Windows and Linux administration</div>
  </div>
`;

const glassdoorCurrentCard = `
  <div class="jobCard JobCard_jobCardContent__Bbij_ JobCardWrapper_easyApplyLabelNoWrap__PtpgT">
    <div class="JobCard_employerInfoAndSaveButton__z5h2I">
      <div class="EmployerProfile_profileContainer__FbmWc EmployerProfile_compact__aGgcL JobCard_employerProfileContainer__7jf9U" id="job-employer-1010303415067">
        <div class="EmployerProfile_employerInfo__wyQgh">
          <div class="EmployerProfile_employerNameContainer__Wt7K9">
            <span class="EmployerProfile_compactEmployerName__hAn5f">1st Visa International</span>
            <div class="rating-single-star_RatingSingleStarContainer__6Tm8E" role="meter" aria-valuenow="3.5"><span>3.5</span></div>
          </div>
        </div>
      </div>
      <button class="BookmarkButton_buttonWrapper__rHASr" aria-label="Save" type="button" data-test="save-job"><div><svg></svg></div></button>
    </div>
    <a class="JobCard_jobTitle__4_O4L" data-test="job-title" href="https://www.glassdoor.co.uk/job-listing/it-business-analyst-1st-visa-international-JV_IC2671300_KO0,19_KE20,42.htm?jl=1010303415067" id="job-title-1010303415067">IT Business Analyst</a>
    <div class="JobCard_location__oeoGd" data-test="emp-location" id="job-location-1010303415067">London, England</div>
    <div class="JobCard_salaryEstimate__D3yWF" data-test="detailSalary" id="job-salary-1010303415067">£56k - £58k<!-- -->&nbsp;<span>(Employer provided)</span></div>
    <div class="JobCard_badgesContainer__h22xG">
      <div class="JobCard_easyApplyTag__LxrFi"><div aria-label="Easy Apply">Easy Apply</div></div>
    </div>
    <a aria-labelledby="job-title-1010303415067 job-salary-1010303415067 job-location-1010303415067 job-employer-1010303415067" class="JobCard_trackingLink__Lp6W6" data-test="job-link" href="/partner/jobListing.htm?pos=101&amp;jobListingId=1010303415067" rel="nofollow" target="_blank"></a>
    <div class="JobCard_showMoreContainer__3ykzK">
      <button aria-label="Show less" type="button"><svg></svg></button>
    </div>
    <div class="JobCard_jobCardLastRow___OrVY"><div class="JobCard_listingAge__jABew" data-test="job-age">11d</div></div>
  </div>
`;

describe('captureCurrentJob', () => {
  it('captures a LinkedIn result card without the hashed classes or the duplicate title', async () => {
    const response = await capture(linkedInCard, 'https://www.linkedin.com/jobs/search/?keywords=data');
    expect(response.success).toBe(true);
    expect(response.job).toMatchObject({
      title: 'Data & Analytics Engineer',
      company: 'JMP USA',
      location: 'Greensboro--Winston-Salem--High Point Area (Hybrid)',
      ageLabel: '6 days ago',
    });
    expect(response.job?.url).toContain('/jobs/view/4401234567/');
  });

  it('captures a linkless LinkedIn card when posted text touches preceding text', async () => {
    const response = await capture(
      linkedInLinklessCard,
      'https://www.linkedin.com/jobs/search-results/?currentJobId=4482461192&keywords=data&start=25'
    );
    expect(response.success).toBe(true);
    expect(response.job).toMatchObject({
      title: 'Bioinformatician II Cancer Center',
      company: 'Atrium Health Wake Forest Baptist',
      location: 'Winston-Salem, NC (On-site)',
    });
    expect(response.job?.ageLabel).toContain('1 week ago');
  });

  it('prefers LinkedIn result cards over an open detail pane on search-results', async () => {
    const response = await capture(
      linkedInSearchWithDetail,
      'https://www.linkedin.com/jobs/search-results/?currentJobId=4482461192&keywords=data'
    );
    expect(response.success).toBe(true);
    expect(response.job?.title).toBe('Card Job');
    expect(response.job?.url).toContain('/jobs/view/4401234567/');
  });

  it('finds a LinkedIn list-item root without a link or posted label', async () => {
    const response = await capture(
      linkedInListItemCard,
      'https://www.linkedin.com/jobs/search-results/?currentJobId=4499999999&keywords=data'
    );
    expect(response.success).toBe(true);
    expect(response.job).toMatchObject({
      title: 'List Only Job',
      company: 'List Company',
      location: 'Raleigh, NC (On-site)',
      url: 'https://www.linkedin.com/jobs/view/4499999999/',
    });
  });

  it('uses JSON-LD on a LinkedIn detail page', async () => {
    const response = await capture(linkedInDetail, 'https://www.linkedin.com/jobs/view/4401234567/');
    expect(response.success).toBe(true);
    expect(response.job).toMatchObject({
      title: 'Data & Analytics Engineer',
      company: 'JMP USA',
      location: 'Greensboro, NC',
      salary: 'USD 90k-120k /yr',
      description: 'Build dashboards.',
      remote: true,
      url: 'https://www.linkedin.com/jobs/view/4401234567/',
    });
    expect(response.job?.postedAt).toBe(Date.parse('2026-10-26T00:00:00Z'));
  });

  it('captures every LinkedIn card on a results page', async () => {
    const response = await capture(linkedInCards, 'https://www.linkedin.com/jobs/search/?keywords=data');
    expect(response.success).toBe(true);
    expect(response.jobs).toHaveLength(2);
    expect(response.jobs?.map((job) => job.title)).toEqual(['Data & Analytics Engineer', 'Backend Developer']);
    expect(response.jobs?.[0]).toMatchObject({
      company: 'JMP USA',
      location: 'Greensboro--Winston-Salem--High Point Area (Hybrid)',
      ageLabel: '6 days ago',
    });
    expect(response.jobs?.[0]?.url).toContain('/jobs/view/4401234567/');
    expect(response.jobs?.[1]).toMatchObject({ company: 'Acme Corp', location: 'Remote', remote: true });
    expect(response.job?.title).toBe('Data & Analytics Engineer');
  });

  it('captures every Indeed card on a results page', async () => {
    const response = await capture(indeedCards, 'https://www.indeed.com/jobs?q=data&l=Greensboro');
    expect(response.success).toBe(true);
    expect(response.jobs).toHaveLength(2);
    expect(response.jobs?.map((job) => job.title)).toEqual(['Data Analyst', 'QA Engineer']);
    expect(response.jobs?.[0]).toMatchObject({
      company: 'Acme Corp',
      location: 'Greensboro, NC',
      url: 'https://www.indeed.com/viewjob?jk=aaa111',
    });
    expect(response.jobs?.[1]).toMatchObject({
      company: 'Beta Inc',
      remote: true,
      url: 'https://www.indeed.com/viewjob?jk=bbb222',
    });
  });

  it('captures every Glassdoor card on a results page', async () => {
    const response = await capture(glassdoorCards, 'https://www.glassdoor.co.uk/Job/jobs.htm?sc.keyword=data');
    expect(response.success).toBe(true);
    expect(response.jobs).toHaveLength(2);
    expect(response.jobs?.map((job) => job.title)).toEqual(['Enterprise Systems Administrator', 'Support Engineer']);
    expect(response.jobs?.[1]).toMatchObject({ company: 'Acme Corp', location: 'Greensboro, NC', ageLabel: '2d' });
  });

  it('captures the current Glassdoor card layout including employer salary', async () => {
    const response = await capture(glassdoorCurrentCard, 'https://www.glassdoor.co.uk/Job/jobs.htm?sc.keyword=business');
    expect(response.success).toBe(true);
    expect(response.job).toMatchObject({
      title: 'IT Business Analyst',
      company: '1st Visa International',
      location: 'London, England',
      salary: '£56k - £58k (Employer provided)',
      ageLabel: '11d',
      remote: false,
    });
    expect(response.job?.url).toContain('jl=1010303415067');
  });

  it('captures an Indeed result card where data-jk sits on the title link', async () => {
    const response = await capture(indeedCard, 'https://www.indeed.com/jobs?q=data&l=Greensboro');
    expect(response.success).toBe(true);
    expect(response.job).toMatchObject({
      title: 'Data Analyst and Developer',
      company: 'Carolina Biological',
      location: 'Whitsett, NC',
      url: 'https://www.indeed.com/viewjob?jk=e86302b36583b276',
    });
    expect(response.job?.ageLabel).toBeUndefined();
    expect(response.job?.salary).toBeUndefined();
  });

  it('captures an Indeed detail page', async () => {
    const response = await capture(indeedDetail, 'https://www.indeed.com/viewjob?jk=abc123');
    expect(response.success).toBe(true);
    expect(response.job).toMatchObject({
      title: 'Data Engineer',
      company: 'JMP USA',
      location: 'Greensboro, NC',
      salary: '$90,000 - $120,000 a year',
      description: 'Build pipelines.',
      url: 'https://www.indeed.com/viewjob?jk=abc123&from=serp',
    });
  });

  it('still captures a Glassdoor card', async () => {
    const response = await capture(
      glassdoorCard,
      'https://www.glassdoor.co.uk/job-listing/enterprise-systems-administrator-JV_KO0,32.htm?jl=1010294393585'
    );
    expect(response.success).toBe(true);
    expect(response.job).toMatchObject({
      title: 'Enterprise Systems Administrator',
      company: 'DoiT',
      location: 'Remote',
      ageLabel: '18d',
      salary: '£51k /yr Median',
      remote: true,
    });
  });

  it('fails cleanly on a page with no job', async () => {
    const response = await capture(noJob, 'https://example.com/about');
    expect(response.success).toBe(false);
    expect(response.error).toMatch(/no job found/i);
  });
});

describe('FIND_APPLY_URL', () => {
  async function applyUrl(
    html: string,
    url: string
  ): Promise<{ success: boolean; url?: string; clicked?: boolean; clickedText?: string }> {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
      url,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const { window } = dom;
    const listeners: Listener[] = [];
    const rect = { width: 100, height: 40, right: 100, bottom: 40, left: 0, top: 0, x: 0, y: 0 };
    window.HTMLElement.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
    window.chrome = {
      runtime: {
        onMessage: { addListener: (fn: Listener) => listeners.push(fn) },
        sendMessage: (_message: unknown, callback?: (response: unknown) => void) => {
          callback?.({ success: true });
        },
        getURL: (path: string) => `chrome-extension://test/${path}`,
        connect: () => ({
          onDisconnect: { addListener: () => {} },
          onMessage: { addListener: () => {} },
          postMessage: () => {},
          disconnect: () => {},
        }),
        lastError: undefined,
      },
      storage: {
        local: { get: async () => ({}), set: async () => {} },
        sync: { get: async () => ({}), set: async () => {} },
      },
    };
    window.eval(source);
    for (let attempt = 0; attempt < 20 && listeners.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (listeners.length === 0) throw new Error('content script never registered a message listener');
    let response: { success: boolean; url?: string } = { success: false };
    listeners[0]({ type: 'FIND_APPLY_URL' }, {}, (value) => {
      response = value as { success: boolean; url?: string };
    });
    dom.window.close();
    return response;
  }

  it('returns the Indeed smartapply link behind Apply now', async () => {
    const response = await applyUrl(indeedApplyButton, 'https://www.indeed.com/viewjob?jk=d69667c5e319b4f0');
    expect(response.success).toBe(true);
    expect(response.url).toContain('smartapply.indeed.com/beta/indeedapply/');
  });

  it('falls back to a generic Apply now link', async () => {
    const response = await applyUrl(genericApplyButton, 'https://www.example.com/jobs/123');
    expect(response.url).toBe('https://jobs.example.com/apply/123');
  });

  it('returns an empty url on pages without an apply link', async () => {
    const response = await applyUrl('<p>About us</p>', 'https://example.com/about');
    expect(response.success).toBe(true);
    expect(response.url).toBe('');
  });
});

describe('CLICK_CONTINUE', () => {
  const wizardPage = `
    <button type="button" data-testid="hp-continue-button-0"><span>Continue</span></button>
    <button type="button" data-testid="continue-button"><span>Continue</span></button>
    <button type="button"><span>Submit application</span></button>
  `;
  const submitOnlyPage = `<button type="button"><span>Submit application</span></button>`;
  const nextPage = `<button type="button"><span>Next</span></button>`;

  async function clickWizard(
    html: string
  ): Promise<{ clicked?: boolean; clickedIds: string[]; clickedTestId: string | null }> {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
      url: 'https://smartapply.indeed.com/beta/indeedapply/apply',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const { window } = dom;
    const listeners: Listener[] = [];
    const rect = { width: 100, height: 40, right: 100, bottom: 40, left: 0, top: 0, x: 0, y: 0 };
    window.HTMLElement.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
    window.chrome = {
      runtime: {
        onMessage: { addListener: (fn: Listener) => listeners.push(fn) },
        sendMessage: (_message: unknown, callback?: (response: unknown) => void) => {
          callback?.({ success: true });
        },
        getURL: (path: string) => `chrome-extension://test/${path}`,
        connect: () => ({
          onDisconnect: { addListener: () => {} },
          onMessage: { addListener: () => {} },
          postMessage: () => {},
          disconnect: () => {},
        }),
        lastError: undefined,
      },
      storage: {
        local: { get: async () => ({}), set: async () => {} },
        sync: { get: async () => ({}), set: async () => {} },
      },
    };
    window.eval(source);
    for (let attempt = 0; attempt < 20 && listeners.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (listeners.length === 0) throw new Error('content script never registered a message listener');

    const clickedIds: string[] = [];
    const buttonEls = Array.from(window.document.querySelectorAll('button')) as HTMLButtonElement[];
    buttonEls.forEach((button, index) => {
      button.id = `btn-${index}`;
      button.addEventListener('click', () => clickedIds.push(button.id));
    });

    let response: { success: boolean; clicked?: boolean } = { success: false };
    listeners[0]({ type: 'CLICK_CONTINUE' }, {}, (value) => {
      response = value as { success: boolean; clicked?: boolean };
    });
    const clickedButton = clickedIds.length ? buttonEls.find((b) => b.id === clickedIds[0]) : null;
    const clickedTestId = clickedButton?.getAttribute('data-testid') || null;
    dom.window.close();
    return { clicked: response.clicked, clickedIds, clickedTestId };
  }

  it('clicks the wizard Continue button and never the submit button', async () => {
    const result = await clickWizard(wizardPage);
    expect(result.clicked).toBe(true);
    expect(result.clickedTestId).toBe('continue-button');
  });

  it('clicks a Next button', async () => {
    const result = await clickWizard(nextPage);
    expect(result.clicked).toBe(true);
  });

  it('refuses to click when only a submit action remains', async () => {
    const result = await clickWizard(submitOnlyPage);
    expect(result.clicked).toBe(false);
    expect(result.clickedIds).toEqual([]);
  });
});
