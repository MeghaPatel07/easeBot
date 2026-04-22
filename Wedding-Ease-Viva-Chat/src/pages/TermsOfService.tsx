import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

const EFFECTIVE_DATE = 'April 13, 2026'
const CONTACT_EMAIL = 'support@theweddingbot.ai'
const COMPANY_NAME = 'TheWeddingBot'
const SERVICE_NAME = 'TheWeddingBot'

export default function TermsOfService() {
  return (
    <div className="gradient-bg min-h-screen text-foreground/85">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-24 w-[28rem] h-[28rem] bg-secondary/10 rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-6 py-12 md:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-foreground/60 hover:text-foreground/90 transition mb-8"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {SERVICE_NAME}
        </Link>

        <header className="mb-10">
          <p className="font-label uppercase tracking-[0.2em] text-2xs text-foreground/40 mb-3">
            Legal
          </p>
          <h1 className="font-headline text-4xl md:text-5xl tracking-tight text-foreground mb-3">
            Terms of Service
          </h1>
          <p className="text-sm text-foreground/50">
            Effective date: {EFFECTIVE_DATE}
          </p>
        </header>

        <article className="prose prose-invert max-w-none prose-headings:font-headline prose-headings:text-foreground prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-3 prose-h3:text-lg prose-p:text-foreground/70 prose-p:leading-relaxed prose-li:text-foreground/70 prose-strong:text-foreground/90 prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
          <p>
            Welcome to {SERVICE_NAME} (the “Service”), an AI-powered wedding
            planning assistant operated by {COMPANY_NAME} (“we,” “us,” or
            “our”). These Terms of Service (“Terms”) form a binding agreement
            between you and {COMPANY_NAME} and govern your access to and use
            of our website, mobile experiences, chatbot, and related features.
            Please read them carefully. By creating an account, signing in, or
            otherwise using the Service, you agree to these Terms and to our{' '}
            <Link to="/privacy">Privacy Policy</Link>.
          </p>

          <h2>1. Eligibility</h2>
          <p>
            You must be at least 13 years old to use the Service, and at least
            16 if you reside in the European Economic Area, the United Kingdom,
            or any jurisdiction that requires a higher minimum age for digital
            consent. If you are under the age of majority in your jurisdiction,
            you confirm that a parent or legal guardian has reviewed and
            accepted these Terms on your behalf. The Service is not directed
            to children under 13, and we do not knowingly collect personal
            information from them.
          </p>

          <h2>2. Your Account</h2>
          <p>
            You may create an account using email, phone (via WhatsApp OTP), or
            a supported third-party identity provider such as Google. You are
            responsible for:
          </p>
          <ul>
            <li>providing accurate, current, and complete information;</li>
            <li>
              maintaining the confidentiality of your credentials and any
              one-time passcodes;
            </li>
            <li>
              all activities that occur under your account, whether or not
              authorized by you; and
            </li>
            <li>
              promptly notifying us at {CONTACT_EMAIL} of any unauthorized
              access or security incident.
            </li>
          </ul>
          <p>
            We may suspend or terminate accounts that contain false information,
            are used to abuse the Service, or that violate these Terms.
          </p>

          <h2>3. Description of the Service</h2>
          <p>
            {SERVICE_NAME} is a conversational AI assistant designed to help
            couples plan weddings. Features include planning, styling
            inspiration, cultural and etiquette knowledge, budgeting,
            checklists, reminders, AI-generated images, voice input and
            text-to-speech, multilingual translation, calendar reminders, and
            shareable chat threads. Some features are available only to
            authenticated users, and certain capabilities are reserved for
            paid plans (see Section 7).
          </p>

          <h2>4. AI Output and Disclaimers</h2>
          <p>
            The Service uses large language models, image generation models,
            and speech models provided by third parties (including, without
            limitation, Microsoft Azure OpenAI Service, Google Gemini, and
            Microsoft Cognitive Services). AI output is generated
            probabilistically and may be inaccurate, incomplete, biased, or
            outdated. <strong>You should not rely on the Service as a
            substitute for professional advice</strong> — including legal,
            medical, mental-health, financial, contractual, or vendor
            negotiation advice. Always verify important information with
            qualified professionals before acting on it.
          </p>
          <p>
            AI-generated images are produced by machine-learning models and may
            depict fictional likenesses. You agree not to use generated images
            in a way that misrepresents real individuals, infringes the rights
            of others, or violates applicable law.
          </p>

          <h2>5. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>
              use the Service for any unlawful, harmful, fraudulent, deceptive,
              or abusive purpose;
            </li>
            <li>
              upload or generate content that is sexually explicit (especially
              involving minors), hateful, harassing, defamatory, threatening,
              or that promotes self-harm or violence;
            </li>
            <li>
              attempt to reverse-engineer, decompile, scrape, or extract the
              underlying models, prompts, training data, or source code;
            </li>
            <li>
              probe, attack, or interfere with the integrity, performance, or
              availability of the Service, or attempt to bypass rate limits,
              quotas, prompt-injection defenses, or content filters;
            </li>
            <li>
              use the Service to develop a competing product or to train
              another machine-learning model;
            </li>
            <li>
              upload personal data of third parties without a lawful basis, or
              upload regulated data such as protected health information,
              children's data, or government identifiers;
            </li>
            <li>
              impersonate any person or misrepresent your affiliation with any
              entity; or
            </li>
            <li>
              violate the acceptable-use or content policies of our upstream AI
              providers, including those of OpenAI, Microsoft, and Google.
            </li>
          </ul>

          <h2>6. User Content and License</h2>
          <p>
            “User Content” means any text, images, audio, files, prompts, or
            other materials that you submit to the Service. You retain
            ownership of your User Content. By submitting it, you grant{' '}
            {COMPANY_NAME} a worldwide, non-exclusive, royalty-free license to
            host, store, reproduce, modify, transmit, and process your User
            Content solely to operate, secure, and improve the Service for you.
            We do not sell your User Content, and we do not use the substance
            of your conversations to train foundation models.
          </p>
          <p>
            You represent and warrant that you have all rights necessary to
            submit your User Content and that it does not infringe any third
            party's intellectual-property, privacy, or publicity rights.
          </p>
          <p>
            <strong>Output.</strong> Subject to your compliance with these
            Terms, you own the content the Service generates in response to
            your prompts (“Output”), to the extent such ownership is permitted
            by applicable law. Because the same prompt may produce similar
            Output for different users, Output is not exclusive to you.
          </p>

          <h2>7. Free and Paid Plans</h2>
          <p>
            Some features of the Service are free; others (such as unlimited
            AI image generation and unlimited checklists) are available only
            on a paid plan. Pricing, features, and quotas for paid plans are
            described at the time of purchase and may change with notice. All
            purchases are non-refundable except where required by law. You are
            responsible for any taxes, currency conversion fees, and bank
            charges associated with your purchase.
          </p>

          <h2>8. Third-Party Services</h2>
          <p>
            The Service integrates with third-party services, including
            Firebase Authentication, Cloud Firestore, Cloud Storage, Google
            Calendar, Microsoft Azure OpenAI, Google Gemini, Microsoft
            Cognitive Services (Speech), Azure Translator, and a WhatsApp
            messaging provider. Your use of those services is governed by
            their respective terms and privacy policies, which we encourage
            you to review.
          </p>

          <h2>9. Intellectual Property</h2>
          <p>
            The Service, including the {SERVICE_NAME} name, logo, design,
            prompts, software, and all content we provide (excluding User
            Content and Output), is owned by {COMPANY_NAME} or its licensors
            and is protected by intellectual-property laws. We grant you a
            limited, revocable, non-exclusive, non-transferable license to use
            the Service in accordance with these Terms.
          </p>

          <h2>10. Feedback</h2>
          <p>
            If you submit suggestions, ideas, or feedback about the Service,
            you grant us a perpetual, irrevocable, royalty-free license to use
            them for any purpose without obligation to you.
          </p>

          <h2>11. Termination</h2>
          <p>
            You may stop using the Service at any time and delete your account
            from within the app or by contacting {CONTACT_EMAIL}. We may
            suspend or terminate your access at any time, with or without
            notice, if we reasonably believe that you have violated these
            Terms, that your use creates legal or security risk for us or other
            users, or that providing the Service is no longer commercially
            viable. Sections that by their nature should survive termination
            (including ownership, disclaimers, indemnity, and limitation of
            liability) will survive.
          </p>

          <h2>12. Disclaimer of Warranties</h2>
          <p>
            THE SERVICE IS PROVIDED ON AN “AS IS” AND “AS AVAILABLE” BASIS. TO
            THE FULLEST EXTENT PERMITTED BY LAW, {COMPANY_NAME.toUpperCase()}{' '}
            DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING IMPLIED
            WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
            TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE
            WILL BE UNINTERRUPTED, ERROR-FREE, ACCURATE, OR THAT AI OUTPUT
            WILL MEET YOUR REQUIREMENTS.
          </p>

          <h2>13. Limitation of Liability</h2>
          <p>
            TO THE FULLEST EXTENT PERMITTED BY LAW, {COMPANY_NAME.toUpperCase()}{' '}
            AND ITS AFFILIATES, OFFICERS, EMPLOYEES, AND AGENTS WILL NOT BE
            LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
            EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS,
            REVENUE, GOODWILL, DATA, OR USE, ARISING OUT OF OR RELATED TO YOUR
            USE OF THE SERVICE, WHETHER BASED ON WARRANTY, CONTRACT, TORT, OR
            ANY OTHER LEGAL THEORY. OUR AGGREGATE LIABILITY FOR ANY CLAIM
            ARISING OUT OF OR RELATED TO THE SERVICE WILL NOT EXCEED THE
            GREATER OF (A) THE AMOUNT YOU PAID US IN THE TWELVE MONTHS
            PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) USD $50.
          </p>

          <h2>14. Indemnity</h2>
          <p>
            You agree to defend, indemnify, and hold harmless {COMPANY_NAME}{' '}
            and its affiliates from and against any claims, damages,
            liabilities, costs, and expenses (including reasonable attorneys'
            fees) arising from or related to your User Content, your use of
            the Service, or your violation of these Terms or applicable law.
          </p>

          <h2>15. Governing Law and Disputes</h2>
          <p>
            These Terms are governed by the laws of India, without regard to
            its conflict-of-laws principles. The courts located in Mumbai,
            India will have exclusive jurisdiction over any dispute arising
            out of or related to these Terms or the Service, except that
            either party may seek injunctive relief in any court of competent
            jurisdiction.
          </p>

          <h2>16. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. If we make a material
            change, we will notify you through the Service or by email and
            update the “Effective date” above. Your continued use of the
            Service after the changes take effect constitutes your acceptance
            of the revised Terms.
          </p>

          <h2>17. Contact</h2>
          <p>
            Questions about these Terms? Contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </article>

        <footer className="mt-14 pt-8 border-t border-foreground/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-foreground/40">
          <p>© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</p>
          <div className="flex gap-5">
            <Link to="/privacy" className="hover:text-foreground/80">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground/80">Terms of Service</Link>
          </div>
        </footer>
      </div>
    </div>
  )
}
