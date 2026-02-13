# HR_index

**An LLM-powered research platform for exploring the Universal Declaration of Human Rights**

HR_index is an interactive research tool that allows users to explore the 30 articles of the Universal Declaration of Human Rights (UDHR), investigate their legal protections across different jurisdictions, examine their real-world status, and discover how different rights intersect and influence each other.

---

## What is HR_index?

HR_index provides three core research capabilities:

### 1. **Legal Framework Analysis (DOSSIER_LEGAL)**
Search for official legal instruments that protect specific human rights at three levels:
- **International**: UN treaties, conventions, and declarations (ICCPR, ICESCR, CEDAW, CRC, etc.)
- **Regional**: European Convention on Human Rights, African Charter, American Convention, ASEAN frameworks
- **National**: Constitutional provisions, domestic legislation, and supreme court decisions

### 2. **Field Status Research (DOSSIER_FIELD)**
Access the latest reports and assessments on the current state of human rights worldwide:
- Human Rights Watch annual and country reports
- Amnesty International research and documentation
- UN Human Rights Office official reports
- Statistical data and trend analysis

### 3. **Nexus Research (NEXUS_RESEARCH)**
Explore academic research on how different human rights intersect and interact:
- Peer-reviewed journal articles
- Working papers and dissertations
- Open-access academic research
- Theoretical frameworks and empirical studies

---

## The 30 Human Rights

The platform is built around the **Universal Declaration of Human Rights (UDHR)**, adopted by the United Nations in 1948. Each of the 30 articles has been condensed into an accessible format:

### Civil Rights (15)
Freedom & Equality, Non-Discrimination, Life & Security, No Slavery, No Torture, Recognition, Equality, Legal Remedy, No Arbitrary Arrest, Fair Trial, Innocence, Privacy, Movement, Asylum, Nationality, Religion, Expression, Duties, Limits

### Political Rights (3)
Assembly, Democracy, Order

### Economic Rights (2)
Property, Work

### Social Rights (5)
Marriage, Social Security, Rest, Standard of Living, Education

### Cultural Rights (1)
Culture

**Why these rights?**
- The UDHR is the most widely recognized human rights framework globally
- Forms the foundation of international human rights law
- Elaborated in binding treaties (ICCPR, ICESCR, and specialized conventions)
- 193 UN member states have committed to these principles
- Extensive legal frameworks, case law, and research exist for each right

---

## How It Works

HR_index uses **Google's Gemini 2.5 Flash Lite** with integrated Google Search grounding to:

1. **Search official sources**: UN sites, regional human rights bodies, government legislation, NGO reports, and academic repositories
2. **Filter for quality**: Prioritizes official primary sources over secondary summaries, Wikipedia, or news articles
3. **Verify results**: Uses Google Search grounding to ensure transparency in source selection
4. **Present findings**: Displays legal instruments, reports, or research papers with direct quotes and links to primary sources

### Technical Architecture

- **Frontend**: React + TypeScript with a unique "technical/archival" design aesthetic
- **AI Engine**: Gemini 2.5 Flash Lite (via Google Generative AI SDK)
- **Search**: Google Search tool integration for real-time web grounding
- **Hosting**: Vercel deployment
- **Data**: Structured around UDHR articles with metadata and summaries

---

## Important Warnings & Limitations

### 1. **This is an LLM-Powered Search Engine**
HR_index uses AI to search, filter, and extract quotes from sources. While it attempts to provide accurate and relevant results, it is **not a substitute for legal advice or professional human rights research**.

### 2. **Possible Errors & Inaccuracies**
The platform may:
- Return incomplete or outdated information
- Miss relevant legal instruments or reports
- Incorrectly interpret search results
- Fail to find sources in certain jurisdictions or languages
- Extract quotes that don't fully capture the context of complex legal provisions

### 3. **Source Verification Required**
**Always verify information through primary sources.** The platform provides direct links to official documents—use them. Do not rely solely on the AI-extracted quotes or references without consulting the full source material.

### 4. **Limited to Available Online Sources**
The platform can only find:
- Publicly accessible documents
- Sources indexed by Google Search
- English-language content (primarily)
- Documents from recognized official domains

It cannot access:
- Paywalled academic journals (JSTOR, Springer, etc.)
- Internal government databases
- Non-digitized historical records
- Documents in languages the model struggles with

### 5. **Temporal Limitations**
- **Legal frameworks**: Aims to find both foundational and recent instruments
- **Status reports**: Prioritizes the most recent reports (2024-2025)
- **Academic research**: Seeks either landmark studies OR recent publications (2020-2025)

The model's training data has a cutoff date, and while Google Search helps with current information, very recent developments may not be fully reflected.

### 6. **No Legal or Political Neutrality Guarantee**
While the platform attempts to provide objective information from official sources, the selection and extraction of quotes may inadvertently reflect biases in:
- Which sources are prioritized by search algorithms
- How the AI model interprets and extracts quotes from information
- What content is available and accessible online

### 7. **Google Search Grounding Dependency**
The platform's accuracy depends heavily on:
- Google Search's index and ranking algorithms
- The availability of official sources online
- The model's ability to interpret search results correctly

---

## Future Improvements

### Model Upgrades
The platform currently uses **Gemini 2.5 Flash Lite** for speed and cost-efficiency. Potential improvements include:

1. **Upgrading to Gemini 2.5 Flash** or **Gemini Pro** for:
   - Better reasoning and source evaluation
   - More accurate legal instrument identification
   - Improved handling of complex queries
   - Better multilingual capabilities

2. **Fine-tuning or RAG implementation** for:
   - Domain-specific knowledge of human rights law
   - Better recognition of legal terminology
   - More consistent source filtering
   - Improved quote extraction and context preservation

3. **Multi-model approach**:
   - Using specialized models for different tasks (legal quote extraction vs. research synthesis)
   - Implementing verification systems with multiple LLMs

### Feature Enhancements

- **Multilingual support**: Expand beyond English to access Spanish, French, Arabic legal frameworks
- **Citation management**: Export findings in academic citation formats
- **Historical tracking**: Track how legal protections have evolved over time
- **Visualization**: Network graphs showing rights interconnections
- **Comparative analysis**: Side-by-side comparison of how different countries protect the same right
- **Custom collections**: Save and organize research findings
- **Collaborative features**: Share research boards with colleagues

### Data Quality Improvements

- **Expanded domain whitelist**: Add more trusted academic and legal repositories
- **Better deduplication**: Prevent showing the same instrument from multiple sources
- **Source ranking**: Prioritize primary sources more effectively
- **Metadata extraction**: Better extraction of dates, authors, jurisdictions
- **PDF text extraction**: Direct analysis of PDF documents rather than relying on web summaries

---

## Use Cases

### For Researchers
- Quickly map legal protections across jurisdictions
- Identify gaps in human rights frameworks
- Discover interdisciplinary academic research
- Track implementation and compliance issues

### For Advocates
- Find authoritative legal instruments to cite
- Access latest reports on human rights conditions
- Build evidence-based advocacy strategies
- Understand intersectionality of rights violations

### For Educators
- Demonstrate how international law works
- Explore real-world application of UDHR principles
- Assign research projects on specific rights
- Visualize connections between different rights

### For Legal Professionals
- Preliminary research on comparative human rights law
- Identify relevant treaty obligations
- Find precedent from regional human rights courts
- Understand how rights interact in complex cases

### For Students
- Learn about human rights frameworks
- Conduct preliminary research for papers
- Understand global human rights architecture
- Explore interdisciplinary dimensions of rights

---

## Technical Details

### Dependencies
- React 19.0.0
- TypeScript
- @google/generative-ai SDK
- Tailwind CSS
- Vercel deployment

### Environment Variables Required
```
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

### Installation
```bash
npm install
npm run dev
```

### Deployment
The platform is designed for Vercel deployment with automatic builds from the main branch.

---

## API & Rate Limits

The platform uses the Google Generative AI API with the following considerations:

- **Model**: `gemini-2.5-flash-lite`
- **Features**: Google Search tool integration enabled
- **Rate limits**: Subject to Google's API rate limits (varies by API key tier)
- **Costs**: API calls incur costs based on Google's pricing (Flash Lite is most economical)

**For production use**, consider:
1. Implementing caching to reduce API calls
2. Setting up usage quotas per user
3. Monitoring API costs
4. Upgrading API tier for higher rate limits

---

## Legal & Ethical Considerations

### Copyright & Attribution
All legal instruments, reports, and research papers remain the intellectual property of their respective authors and organizations. The platform provides links to original sources and does not claim ownership of any content.

### Data Privacy
The platform does not:
- Store user queries permanently
- Track user research patterns
- Share user data with third parties
- Require user accounts or personal information

### Terms of Use
This platform is provided "as is" for educational and research purposes. Users are responsible for:
- Verifying information independently
- Complying with terms of service of linked resources
- Respecting copyright and licensing of source materials
- Understanding that this is not professional legal advice

---

## Contributing & Feedback

This is an experimental research tool. Contributions, suggestions, and bug reports are welcome:

### Known Issues
- Some searches return no results even when relevant sources exist
- Occasional duplicate sources from different URLs
- Limited coverage of non-English legal frameworks
- Some paywalled sources may slip through filters

### Reporting Problems
When reporting issues, please include:
1. The specific right being researched
2. The scope (International/Regional/National) and subscope (if applicable)
3. What you expected to find vs. what was returned
4. Screenshots if relevant

### Improvement Suggestions
Priority areas for enhancement:
1. More comprehensive domain filtering
2. Better multilingual support
3. Improved deduplication logic
4. Enhanced source quality ranking
5. Citation export functionality

---

## License

This project is for educational and research purposes. The code is provided as-is. All human rights instruments, reports, and academic papers accessed through this platform remain subject to their original licenses and copyrights.

---

## Acknowledgments

Built on the foundation of:
- **Universal Declaration of Human Rights** (UN, 1948)
- **Open-source human rights data** from UN, regional bodies, NGOs, and academic institutions
- **Public legal repositories** and official government sources worldwide

Special recognition to human rights defenders, researchers, and organizations worldwide who make their work publicly accessible.

---

## Contact & Support

For questions, issues, or collaboration inquiries, please use the platform's feedback mechanisms or open an issue in the repository.

**Remember**: HR_index is a research tool, not a substitute for professional legal advice or comprehensive human rights analysis. Always verify information through primary sources and consult experts when making legal or policy decisions.

---

*Last updated: February 2025*
