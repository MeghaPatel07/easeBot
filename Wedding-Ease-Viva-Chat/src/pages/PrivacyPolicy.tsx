import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

const EFFECTIVE_DATE = 'April 13, 2026'
const CONTACT_EMAIL = 'privacy@theweddingbot.ai'
const COMPANY_NAME = 'TheWeddingBot'
const SERVICE_NAME = 'TheWeddingBot'

export default function PrivacyPolicy() {
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
            Privacy Policy
          </h1>
          <p className="text-sm text-foreground/50">
            Effective date: {EFFECTIVE_DATE}
          </p>
        </header>

        <article className="prose prose-invert max-w-none prose-headings:font-headline prose-headings:text-foreground prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-3 prose-h3:text-lg prose-p:text-foreground/70 prose-p:leading-relaxed prose-li:text-foreground/70 prose-strong:text-foreground/90 prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
          <p>
            This Privacy Policy explains how {COMPANY_NAME} (“we,” “us,” or
            “our”) collects, uses, shares, and protects your personal
            information when you use {SERVICE_NAME} (the “Service”), our
            AI-powered wedding planning assistant. By using the Service, you
            agree to the practices described in this Policy and to our{' '}
            <Link to="/terms">Terms of Service</Link>.
          </p>

          <h2>1. Summary</h2>
          <ul>
            <li>
              <strong>What we collect:</strong> account details, your chat
              messages and uploads, voice recordings, profile preferences, and
              technical metadata.
            </li>
            <li>
              <strong>Why we collect it:</strong> to provide and personalize
              the Service, to operate AI features, to keep your account
              secure, to comply with law, and to improve product quality.
            </li>
            <li>
              <strong>Who we share it with:</strong> a small set of vetted
              processors (Firebase, Microsoft Azure, Google Gemini, a WhatsApp
              messaging provider, payment processors) — never data brokers.
            </li>
            <li>
              <strong>Your choices:</strong> you can access, export, correct,
              or delete your data at any time, and you may close your account.
            </li>
            <li>
              <strong>We do not sell your personal information</strong>, and we
              do not use the substance of your conversations to train
              foundation models.
            </li>
          </ul>

          <h2>2. Information We Collect</h2>
          <h3>a. Information you provide</h3>
          <ul>
            <li>
              <strong>Account information:</strong> name, email address, phone
              number (in E.164 format), password (hashed), profile photo, and
              authentication identifiers from Google, Firebase, or our
              WhatsApp OTP provider.
            </li>
            <li>
              <strong>Wedding-planning content:</strong> chat messages,
              checklists, budgets, reminders, calendar events, shopping lists,
              saved items, partner-collaboration invites, and any images,
              audio, or files you upload or generate.
            </li>
            <li>
              <strong>Personalization:</strong> preferred nickname, tone
              sliders, voice preset, language, partner names, wedding date,
              and other settings you choose to share.
            </li>
            <li>
              <strong>Voice input:</strong> short audio recordings captured
              when you tap the microphone, used for speech-to-text and
              discarded after transcription.
            </li>
          </ul>
          <h3>b. Information we collect automatically</h3>
          <ul>
            <li>
              <strong>Device and log data:</strong> IP address, browser type,
              operating system, device identifiers, language, time zone,
              referring page, and pages viewed.
            </li>
            <li>
              <strong>Usage data:</strong> features used, AI mode triggered,
              prompts submitted, tool actions invoked, message timestamps,
              tokens consumed, and rate-limit counters.
            </li>
            <li>
              <strong>Cookies and local storage:</strong> we use a small number
              of strictly necessary and functional cookies / local-storage
              keys to keep you signed in and to remember preferences. We do
              not use third-party advertising cookies.
            </li>
          </ul>
          <h3>c. Information from third parties</h3>
          <ul>
            <li>
              <strong>Identity providers:</strong> if you sign in with Google,
              we receive your name, email, profile photo, and Google account
              identifier.
            </li>
            <li>
              <strong>Reminders &amp; notifications:</strong> reminders you
              create (in-chat or via the Reminders page) are stored in our
              own database. We send notifications via email (for email and
              Google sign-in users) or WhatsApp (for phone sign-in users).
              Reminders are retained until you delete them, and we do not
              share reminder content with any third party.
            </li>
          </ul>

          <h2>3. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul>
            <li>create and manage your account and authenticate you;</li>
            <li>
              operate AI features — including sending your prompts and
              relevant context to large language, image, and speech models so
              they can generate a response for you;
            </li>
            <li>
              personalize your experience based on your settings, preferences,
              and saved data;
            </li>
            <li>
              save and synchronize checklists, budgets, reminders, calendar
              events, and other planning data across your devices;
            </li>
            <li>
              detect, investigate, and prevent fraud, abuse, prompt injection,
              spam, and other security incidents;
            </li>
            <li>
              measure and improve the quality, performance, and reliability of
              the Service;
            </li>
            <li>
              communicate with you about your account, security alerts,
              product updates, and (with your consent where required)
              promotional offers; and
            </li>
            <li>
              comply with legal obligations and enforce our{' '}
              <Link to="/terms">Terms of Service</Link>.
            </li>
          </ul>

          <h2>4. AI Processing</h2>
          <p>
            When you send a message, your prompt — and, where relevant, recent
            conversation history, personalization, and tool results — is sent
            to one or more AI providers so the Service can return a response.
            Our current AI processors include:
          </p>
          <ul>
            <li>
              <strong>Microsoft Azure OpenAI Service</strong> — primary text
              generation (GPT-4o family).
            </li>
            <li>
              <strong>Google Gemini</strong> — image generation, with Azure
              gpt-image-1 as a fallback.
            </li>
            <li>
              <strong>Microsoft Cognitive Services (Speech)</strong> —
              speech-to-text and text-to-speech.
            </li>
            <li>
              <strong>Microsoft Azure Translator</strong> — language detection
              and translation.
            </li>
          </ul>
          <p>
            These providers process your data on our behalf as data processors
            under contractual safeguards. Per their enterprise terms, your
            content is not used to train their foundation models. We do not
            sell your prompts or conversations, and we do not use them to
            train any model of our own.
          </p>

          <h2>5. Legal Bases (EEA, UK, and Similar Regions)</h2>
          <p>
            If you are located in the European Economic Area, the United
            Kingdom, Switzerland, or another region with similar laws, we
            process your personal data under the following legal bases:
          </p>
          <ul>
            <li>
              <strong>Performance of a contract</strong> — to deliver the
              Service you request.
            </li>
            <li>
              <strong>Legitimate interests</strong> — to secure the Service,
              prevent abuse, debug issues, and improve product quality, in a
              way that does not override your rights and freedoms.
            </li>
            <li>
              <strong>Consent</strong> — for optional features such as
              calendar access, marketing emails, and voice recording, where
              consent is required by law.
            </li>
            <li>
              <strong>Legal obligation</strong> — to comply with laws,
              regulations, court orders, and lawful government requests.
            </li>
          </ul>

          <h2>6. How We Share Information</h2>
          <p>
            We share personal information only as described below. We do not
            sell personal information, and we do not share it with advertisers
            or data brokers.
          </p>
          <ul>
            <li>
              <strong>Service providers and processors:</strong> Firebase
              Authentication, Cloud Firestore, Firebase Storage, and Cloud
              Functions (Google LLC); Microsoft Azure OpenAI, Cognitive
              Services, and Translator (Microsoft Corporation); Google Gemini
              (Google LLC); a WhatsApp Business Solution Provider for OTP
              delivery; and analytics, error-monitoring, and email vendors
              under written data-protection agreements.
            </li>
            <li>
              <strong>People you choose to share with:</strong> if you invite
              a partner to collaborate, share a chat thread, or publish an
              AI-generated image, the recipients of those shares will be able
              to see the content you shared.
            </li>
            <li>
              <strong>Legal and safety:</strong> we may disclose information
              when we reasonably believe it is necessary to comply with the
              law, respond to a valid legal request, enforce our Terms,
              protect our rights or the rights of others, or address fraud,
              security, or technical issues.
            </li>
            <li>
              <strong>Business transfers:</strong> if {COMPANY_NAME} is
              involved in a merger, acquisition, financing, reorganization, or
              sale of assets, your information may be transferred as part of
              that transaction, subject to standard confidentiality
              protections and notice to you where required.
            </li>
          </ul>

          <h2>7. International Data Transfers</h2>
          <p>
            We and our processors may store and process your information in
            countries other than your own, including the United States,
            European Union, and India. Where required by law, we rely on
            appropriate safeguards such as the European Commission's Standard
            Contractual Clauses to protect cross-border transfers.
          </p>

          <h2>8. Data Retention</h2>
          <p>
            We retain your information for as long as your account is active
            and as needed to provide the Service. Specifically:
          </p>
          <ul>
            <li>
              <strong>Account data</strong> is retained until you delete your
              account.
            </li>
            <li>
              <strong>Chat threads, checklists, budgets, and other planning
              data</strong> are retained until you delete them.
            </li>
            <li>
              <strong>Shared chat links</strong> automatically expire 7 days
              after creation.
            </li>
            <li>
              <strong>Voice recordings</strong> are discarded immediately after
              transcription.
            </li>
            <li>
              <strong>Server logs and security telemetry</strong> are retained
              for up to 90 days, and longer if needed to investigate an
              incident.
            </li>
          </ul>
          <p>
            After deletion, residual copies may persist in encrypted backups
            for a limited period before being overwritten.
          </p>

          <h2>9. Your Rights and Choices</h2>
          <p>
            Depending on where you live, you may have the right to:
          </p>
          <ul>
            <li>access the personal information we hold about you;</li>
            <li>correct inaccurate information;</li>
            <li>delete your information and your account;</li>
            <li>
              export your information in a structured, machine-readable
              format;
            </li>
            <li>
              object to or restrict certain processing, including processing
              based on legitimate interests;
            </li>
            <li>withdraw consent where processing is based on consent; and</li>
            <li>
              lodge a complaint with your local data-protection authority.
            </li>
          </ul>
          <p>
            You can exercise most of these rights from within the app. For
            anything else, contact{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will
            respond within the timeframe required by applicable law. We will
            never charge you for exercising your rights, and we will never
            retaliate against you for doing so.
          </p>

          <h2>10. Security</h2>
          <p>
            We protect your information using administrative, technical, and
            physical safeguards, including encryption in transit (TLS),
            encryption at rest for our databases, hashed passwords, role-based
            access controls, audit logging, rate limiting, prompt-injection
            defenses, and regular dependency and vulnerability reviews. No
            system is perfectly secure, however, and we cannot guarantee
            absolute security.
          </p>

          <h2>11. Children's Privacy</h2>
          <p>
            The Service is not directed to children under 13, and we do not
            knowingly collect personal information from them. If you are at
            least 13 but under the age of digital consent in your country
            (typically 16 in the EEA / UK), you may use the Service only with
            the involvement of a parent or legal guardian. If you believe a
            child has provided us with personal information, please contact{' '}
            {CONTACT_EMAIL} and we will delete it.
          </p>

          <h2>12. Region-Specific Disclosures</h2>
          <h3>European Economic Area, United Kingdom, and Switzerland</h3>
          <p>
            You have the rights described in Section 9 under the GDPR / UK
            GDPR. The data controller is {COMPANY_NAME}. You may contact our
            privacy team at {CONTACT_EMAIL}. You also have the right to lodge
            a complaint with your local supervisory authority.
          </p>
          <h3>California, USA</h3>
          <p>
            Under the California Consumer Privacy Act (as amended by the
            CPRA), you have the right to know, delete, correct, and
            limit the use of sensitive personal information, and the right to
            opt out of the sale or sharing of personal information. We do not
            sell or share personal information as those terms are defined by
            the CCPA.
          </p>
          <h3>India</h3>
          <p>
            We process personal data in accordance with the Digital Personal
            Data Protection Act, 2023. You may contact our Grievance Officer at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> for any
            data-protection concerns.
          </p>

          <h2>13. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. If we make a
            material change, we will notify you through the Service or by
            email and update the “Effective date” above. Your continued use of
            the Service after the changes take effect indicates that you
            accept the revised Policy.
          </p>

          <h2>14. Contact Us</h2>
          <p>
            If you have questions or concerns about this Privacy Policy or our
            data practices, please contact us at{' '}
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
