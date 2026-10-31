// Launch blog content (titles and categories from the Blogs & Reviews mockup, slide 9).
// Written as general Ayurvedic wellness guidance — no medical claims. Editable in the admin CMS.

const categories = [
  { slug: "hair-fall-guide", name: "Hair Fall Guide", sortOrder: 1 },
  { slug: "mens-hair-care", name: "Men's Hair Care", sortOrder: 2 },
  { slug: "womens-hair-care", name: "Women's Hair Care", sortOrder: 3 },
  { slug: "ayurveda-ingredients", name: "Ayurveda & Ingredients", sortOrder: 4 },
  { slug: "product-education", name: "Product Education", sortOrder: 5 },
  { slug: "lifestyle-wellness", name: "Lifestyle & Wellness", sortOrder: 6 },
];

const posts = [
  {
    slug: "why-hair-fall-happens-after-21",
    title: "Why Hair Fall Happens in Men and Women After 21",
    category: "hair-fall-guide",
    isFeatured: true,
    publishAt: "2025-05-20T09:00:00+05:30",
    excerpt: "Understand the root causes of hair fall after 21 and how Ayurveda helps restore balance from within for long-term hair health.",
    coverImage: { url: "/images/blog/blog-featured.jpg", alt: "Woman gently massaging her scalp" },
    tags: ["hair fall", "dht", "ayurveda"],
    contentHtml: `<p>Shedding 50–100 hairs a day is a normal part of the hair growth cycle. When you start noticing more on your pillow, in the shower drain or on your comb, it is usually a sign that something has tipped the balance — and for many people that begins in their twenties.</p>
<h2>What changes after 21</h2>
<p>Several everyday factors tend to come together in early adulthood:</p>
<ul><li><strong>Hormonal sensitivity.</strong> In some people, hair follicles are more sensitive to DHT, a hormone derived from testosterone, which can gradually shrink follicles over time.</li><li><strong>Stress and sleep.</strong> Exams, new jobs and late nights can push more hairs into the resting (shedding) phase at once.</li><li><strong>Diet.</strong> Skipped meals and low protein, iron or B-vitamin intake leave less nourishment for growing hair.</li><li><strong>Styling and pollution.</strong> Heat tools, tight hairstyles and city dust all add strain to the scalp.</li></ul>
<h2>The Ayurvedic view</h2>
<p>Ayurveda links excessive hair fall to an imbalance of <em>Pitta</em> dosha — the principle of heat and metabolism. When Pitta is aggravated, the scalp can feel warm, oily or irritated, and the roots weaken. The traditional approach is to cool and nourish the scalp, support digestion and build steady daily habits.</p>
<h2>Simple steps that help</h2>
<ol><li>Oil your scalp two to three times a week with a herbal oil, massaging gently with your fingertips.</li><li>Use a mild, sulfate-free cleanser so you don’t strip the scalp’s natural oils.</li><li>Eat regular meals with protein, leafy greens, nuts and seeds.</li><li>Protect your sleep — seven to eight hours gives your body time to repair.</li></ol>
<blockquote>Consistency matters more than intensity. A gentle ritual you follow every week beats an occasional deep treatment.</blockquote>
<p>If hair fall is sudden, patchy or comes with other symptoms, please speak to a dermatologist — it can point to an underlying condition that needs medical care.</p>`,
  },
  {
    slug: "how-to-use-hair-oil-correctly",
    title: "How to Use Hair Oil Correctly for Hair Fall",
    category: "product-education",
    publishAt: "2025-05-18T09:00:00+05:30",
    excerpt: "The right way to oil your scalp for maximum absorption and visible results.",
    coverImage: { url: "/images/blog/blog-2.jpg", alt: "Herbal oil dropping from a dropper onto a palm" },
    tags: ["hair oil", "how to"],
    contentHtml: `<p>Oiling is one of the oldest hair rituals in India, but how you oil makes a real difference to what your scalp gets out of it.</p>
<h2>Before you begin</h2>
<p>Start with dry, detangled hair. Warm the bottle in a bowl of warm water for a minute — gently warm oil spreads more easily and feels soothing on the scalp.</p>
<h2>The method</h2>
<ol><li><strong>Part your hair</strong> into sections so the oil reaches the scalp, not just the lengths.</li><li><strong>Apply to the roots</strong> using the dropper or your fingertips, section by section.</li><li><strong>Massage for five minutes</strong> in small circles with the pads of your fingers. Avoid nails and harsh rubbing.</li><li><strong>Leave it on for 30–60 minutes.</strong> Overnight oiling isn’t necessary and can attract dust.</li><li><strong>Wash with a mild cleanser</strong> — you may need two light rounds to remove the oil fully.</li></ol>
<h2>How often?</h2>
<p>Two to three times a week works well for most people. If your scalp is very oily, start with once or twice a week.</p>
<h2>Common mistakes</h2>
<ul><li>Using too much oil, which makes washing harder and can leave residue.</li><li>Tying hair tightly right after oiling, which pulls on weakened roots.</li><li>Expecting overnight results — give any routine at least six to eight weeks.</li></ul>`,
  },
  {
    slug: "bhringraj-for-hair-why-ayurveda-loves-it",
    title: "Bhringraj for Hair: Why Ayurveda Loves It",
    category: "ayurveda-ingredients",
    publishAt: "2025-05-16T09:00:00+05:30",
    excerpt: "Discover the ancient herb Bhringraj and its incredible benefits for hair roots.",
    coverImage: { url: "/images/blog/blog-3.jpg", alt: "Bhringraj plant with a small white flower" },
    tags: ["bhringraj", "ingredients"],
    contentHtml: `<p>Bhringraj (<em>Eclipta alba</em>) is called <em>Keshraj</em> — “king of hair” — in classical Ayurvedic texts. It grows in damp places across India and has been used in hair oils for centuries.</p>
<h2>What it is traditionally used for</h2>
<ul><li>Nourishing the scalp and hair roots</li><li>Cooling an over-heated, Pitta-aggravated scalp</li><li>Supporting the natural colour and lustre of hair</li></ul>
<h2>How it is prepared</h2>
<p>Traditionally, the fresh herb is slowly cooked into a base oil such as sesame or coconut so its properties are carried into the oil — a process known as <em>taila paka</em>. This slow infusion is gentler than simply mixing in an extract.</p>
<h2>Pairing Bhringraj</h2>
<p>Bhringraj is often combined with Amla, Brahmi and Hibiscus. Together they form the backbone of many classic hair formulations, each adding nourishment, cooling or conditioning.</p>
<p>As with any herb, do a patch test first if you have sensitive skin.</p>`,
  },
  {
    slug: "3-shot-hair-ritual",
    title: "3-Shot Hair Ritual: How ManushyaM Fits Into Your Weekly Routine",
    category: "lifestyle-wellness",
    publishAt: "2025-05-14T09:00:00+05:30",
    excerpt: "Simple. Effective. Ayurvedic. A weekly ritual that supports hair strength naturally.",
    coverImage: { url: "/images/blog/blog-4.jpg", alt: "ManushyaM therapy kit with jute pouch" },
    tags: ["ritual", "routine"],
    contentHtml: `<p>Our therapy is designed around three applications — a rhythm that is easy to keep up even in a busy week.</p>
<h2>The ritual</h2>
<ol><li><strong>Apply.</strong> Massage the hair oil gently into your scalp and roots.</li><li><strong>Nourish.</strong> Leave it on for 30–60 minutes while you read, cook or unwind.</li><li><strong>Rinse.</strong> Wash with the ManushyaM anti-hairfall shampoo.</li></ol>
<h2>A sample week</h2>
<ul><li><strong>Monday evening</strong> — first application</li><li><strong>Thursday evening</strong> — second application</li><li><strong>Sunday morning</strong> — third application</li></ul>
<p>Many customers tell us they notice less hair fall after the third application. Everyone’s hair is different, so keep going for a few weeks to see how your scalp responds.</p>
<blockquote>Treat it as time for yourself — a few quiet minutes of care, three times a week.</blockquote>`,
  },
  {
    slug: "mens-hair-care-daily-habits",
    title: "Men’s Hair Care: 7 Daily Habits for Stronger Roots",
    category: "mens-hair-care",
    publishAt: "2025-05-10T09:00:00+05:30",
    excerpt: "Small, practical changes to your daily routine that keep your scalp healthy and your hair stronger.",
    coverImage: { url: "/images/blog/blog-1.jpg", alt: "Man checking his hairline" },
    tags: ["men", "habits"],
    contentHtml: `<p>Most men only think about their hair once they notice it thinning. A few simple habits, started early, go a long way.</p>
<ol><li><strong>Wash with lukewarm water.</strong> Very hot water dries out the scalp.</li><li><strong>Don’t over-wash.</strong> Every other day is enough for most hair types.</li><li><strong>Towel gently.</strong> Pat dry instead of rubbing hard.</li><li><strong>Go easy on gels and waxes.</strong> Wash styling products out the same day.</li><li><strong>Oil twice a week.</strong> A short scalp massage improves the feel of the scalp and relaxes you.</li><li><strong>Eat protein at every meal.</strong> Dal, eggs, paneer, curd and nuts all help.</li><li><strong>Manage stress.</strong> A daily walk or ten minutes of breathing practice is a good start.</li></ol>
<p>If you notice a receding hairline or thinning crown, starting a consistent routine sooner rather than later gives you the best chance of keeping what you have.</p>`,
  },
  {
    slug: "womens-hair-care-seasonal-shedding",
    title: "Women’s Hair Care: Understanding Seasonal Shedding",
    category: "womens-hair-care",
    publishAt: "2025-05-06T09:00:00+05:30",
    excerpt: "Why many women notice more hair fall at certain times of year — and how to care for your scalp through it.",
    coverImage: { url: "/images/blog/pot-pour.jpg", alt: "Herbal oil being poured from a copper pot" },
    tags: ["women", "seasonal"],
    contentHtml: `<p>It is common to notice more hair in your brush during the monsoon or at the change of seasons. Humidity, sweat and changes in routine can all leave the scalp more prone to build-up and irritation.</p>
<h2>Caring for your scalp through the seasons</h2>
<ul><li><strong>Keep the scalp clean and dry.</strong> Don’t tie up damp hair.</li><li><strong>Choose a gentle cleanser</strong> that removes sweat and oil without stripping.</li><li><strong>Oil lightly</strong> and wash it out within an hour on humid days.</li><li><strong>Loosen your hairstyles.</strong> Tight buns and ponytails strain the roots.</li></ul>
<h2>When to look closer</h2>
<p>Shedding linked to the seasons usually settles within a few weeks. If it continues for months, or follows events such as pregnancy, illness or a big change in diet, a doctor can check for causes like low iron or thyroid changes.</p>`,
  },
];

module.exports = { categories, posts };
