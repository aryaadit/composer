import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Composer",
  description: "How Composer collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-cream px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="inline-block font-sans text-xs text-muted hover:text-charcoal transition-colors mb-8"
        >
          &larr; Back
        </Link>

        <h1 className="font-serif text-3xl font-normal text-charcoal mb-2">
          Privacy Policy
        </h1>
        <p className="font-sans text-sm text-muted mb-10">
          Last updated: April 28, 2026
        </p>

        <p className="font-sans text-sm leading-relaxed text-charcoal mb-4">
          Composer (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;)
          respects your privacy. This policy explains what data we collect, how
          we use it, and the choices you have. Composer is operated by Palate.
        </p>

        <h2 className="font-sans font-medium text-base text-charcoal mt-10 mb-3">
          Information We Collect
        </h2>
        <p className="font-sans text-sm leading-relaxed text-charcoal mb-4">
          When you use Composer, we collect:
        </p>
        <ul className="font-sans text-sm leading-relaxed text-charcoal mb-4 list-disc pl-5 space-y-1">
          <li>Phone number, for account creation and SMS verification</li>
          <li>Name, for personalizing your itineraries</li>
          <li>
            Preferences you provide during onboarding, including dietary
            restrictions, favorite neighborhoods, and drinking preferences
          </li>
          <li>Itineraries you generate and save</li>
          <li>
            Email address, if you choose to add one for reservation
            confirmations and recaps
          </li>
        </ul>
        <p className="font-sans text-sm leading-relaxed text-charcoal mb-4">
          We do not collect precise location data, payment information, or
          social media data.
        </p>

        <h2 className="font-sans font-medium text-base text-charcoal mt-10 mb-3">
          How We Use Your Information
        </h2>
        <p className="font-sans text-sm leading-relaxed text-charcoal mb-4">
          We use your information to:
        </p>
        <ul className="font-sans text-sm leading-relaxed text-charcoal mb-4 list-disc pl-5 space-y-1">
          <li>Authenticate your account via SMS verification</li>
          <li>
            Generate personalized itineraries based on your preferences
          </li>
          <li>Save and recall your past itineraries</li>
          <li>
            Send reservation confirmations and recap emails, if you opt in
          </li>
          <li>Improve our recommendations and venue scoring</li>
        </ul>

        <h2 className="font-sans font-medium text-base text-charcoal mt-10 mb-3">
          SMS Communications
        </h2>
        <p className="font-sans text-sm leading-relaxed text-charcoal mb-4">
          Composer uses SMS messages for account verification only. By
          providing your phone number and tapping &ldquo;Send Code,&rdquo; you
          consent to receive a one-time verification code via SMS. Message
          frequency: one verification code per sign-in attempt. Message and
          data rates may apply. Reply STOP to opt out at any time, or HELP for
          assistance.
        </p>
        <p className="font-sans text-sm leading-relaxed text-charcoal mb-4">
          We do not share, sell, or transfer phone numbers or SMS opt-in
          consent data to third parties for marketing purposes. Phone numbers
          are used solely for authentication and are stored securely in our
          authentication system.
        </p>

        <h2 className="font-sans font-medium text-base text-charcoal mt-10 mb-3">
          Third-Party Services
        </h2>
        <p className="font-sans text-sm leading-relaxed text-charcoal mb-4">
          We use the following third-party services to operate Composer:
        </p>
        <ul className="font-sans text-sm leading-relaxed text-charcoal mb-4 list-disc pl-5 space-y-1">
          <li>
            Supabase, for authentication, database, and user account storage
          </li>
          <li>Twilio, for SMS verification code delivery</li>
          <li>Google Gemini, for generating itinerary copy</li>
          <li>OpenWeatherMap, for weather data shown on itineraries</li>
          <li>Vercel, for hosting</li>
        </ul>
        <p className="font-sans text-sm leading-relaxed text-charcoal mb-4">
          Each service has its own privacy practices. We share only the minimum
          data required for each service to function.
        </p>

        <h2 className="font-sans font-medium text-base text-charcoal mt-10 mb-3">
          Data Retention
        </h2>
        <p className="font-sans text-sm leading-relaxed text-charcoal mb-4">
          We retain your account data for as long as your account is active. If
          you delete your account, we remove your personal data within 30 days,
          except where required to retain it by law.
        </p>

        <h2 className="font-sans font-medium text-base text-charcoal mt-10 mb-3">
          Your Rights
        </h2>
        <p className="font-sans text-sm leading-relaxed text-charcoal mb-4">
          You can:
        </p>
        <ul className="font-sans text-sm leading-relaxed text-charcoal mb-4 list-disc pl-5 space-y-1">
          <li>
            Access the data we hold about you by contacting hello@onpalate.com
          </li>
          <li>
            Request deletion of your account and data by contacting
            hello@onpalate.com
          </li>
          <li>
            Update your profile information at any time within the app
          </li>
          <li>
            Opt out of SMS by replying STOP to any verification message
          </li>
        </ul>

        <h2 className="font-sans font-medium text-base text-charcoal mt-10 mb-3">
          Children&apos;s Privacy
        </h2>
        <p className="font-sans text-sm leading-relaxed text-charcoal mb-4">
          Composer is not directed at children under 13. We do not knowingly
          collect data from children under 13. If you believe a child has
          provided us with personal data, contact us at hello@onpalate.com and
          we will delete it.
        </p>

        <h2 className="font-sans font-medium text-base text-charcoal mt-10 mb-3">
          Changes to This Policy
        </h2>
        <p className="font-sans text-sm leading-relaxed text-charcoal mb-4">
          We may update this policy from time to time. The &ldquo;Last
          updated&rdquo; date at the top of this page reflects when changes
          were made. Continued use of Composer after changes constitutes
          acceptance of the updated policy.
        </p>

        <h2 className="font-sans font-medium text-base text-charcoal mt-10 mb-3">
          Contact
        </h2>
        <p className="font-sans text-sm leading-relaxed text-charcoal mb-4">
          For questions about this privacy policy or to request data access or
          deletion, email{" "}
          <a
            href="mailto:hello@onpalate.com"
            className="underline hover:text-charcoal transition-colors"
          >
            hello@onpalate.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
