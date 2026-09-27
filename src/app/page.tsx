import ChatWidget from "@/components/chat/ChatWidget";
import { FACTS } from "@/lib/facts";
import { Building2, Shield, Truck, Award, MapPin, Phone, Mail, ChevronRight } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Demo Homepage simulating RDC website embedding
// This page shows the chat widget in context of a real-looking website
// ─────────────────────────────────────────────────────────────────────────────

const STATS = [
  { value: "100+", label: "Commercial Plants" },
  { value: "20+", label: "States" },
  { value: "25+", label: "Years of Excellence" },
  { value: "5000+", label: "Projects Delivered" },
];

const FEATURES = [
  {
    icon: Shield,
    title: "Quality Assured",
    desc: "Every batch digitally monitored through our QMS — from batching plant to your site.",
  },
  {
    icon: Truck,
    title: "Live Tracking",
    desc: "Track your transit mixer in real-time on RDCTrak. Know exactly when concrete arrives.",
  },
  {
    icon: Building2,
    title: "Pan-India Presence",
    desc: "100+ plants across 20+ states — serving tier-1, tier-2, and major infrastructure projects.",
  },
  {
    icon: Award,
    title: "Trusted by Leaders",
    desc: "Supplying to TATA, L&T, BHEL, HCC, Godrej, Lodha, Metro Rail projects and more.",
  },
];

const SERVICES = [
  { name: "Standard Ready-Mix", desc: "M10 to M50 grades for all construction needs" },
  { name: "High-Performance Concrete", desc: "HPC and SCC for critical structural requirements" },
  { name: "Sustainable Mixes", desc: "Fly ash and GGBS blended eco-friendly concrete" },
  { name: "Site Captive Plants", desc: "Dedicated batching plants for mega infrastructure projects" },
  { name: "Customer Connect App", desc: "Digital ordering, tracking, and invoice management" },
  { name: "RDCTrak Monitoring", desc: "Real-time transit mixer GPS tracking for clients" },
];

const LOCATIONS = [
  "Mumbai", "Delhi NCR", "Bangalore", "Hyderabad", "Chennai",
  "Pune", "Kolkata", "Ahmedabad", "Surat", "Kochi", "Thiruvananthapuram",
  "Bhopal", "Guwahati", "Goa", "Patna", "Jamshedpur", "Coimbatore", "Trichy",
];

export default function HomePage() {
  return (
    <div className="min-h-screen" style={{ background: "#F8FAFC" }}>

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-40 border-b"
        style={{
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(12px)",
          borderColor: "#E2E8F0",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ background: "linear-gradient(135deg, #E85D04 0%, #F48C06 100%)" }}
              >
                RDC
              </div>
              <div>
                <div className="font-bold text-gray-800 leading-tight text-sm">RDC Concrete</div>
                <div className="text-gray-400 text-xs">India&apos;s Ready-Mix Leader</div>
              </div>
            </div>

            {/* Nav Links */}
            <div className="hidden md:flex items-center gap-6">
              {["About", "Products", "Locations", "Technology", "Careers"].map((item) => (
                <a
                  key={item}
                  href="#"
                  className="text-sm text-gray-600 hover:text-orange-600 font-medium transition-colors"
                >
                  {item}
                </a>
              ))}
            </div>

            {/* CTA */}
            <a
              href="#contact"
              className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #E85D04 0%, #F48C06 100%)" }}
            >
              Get Quote <ChevronRight size={14} />
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ─────────────────────────────────────────────────── */}
      <section
        className="relative py-24 px-4 overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0F1E35 0%, #1B2A4A 60%, #243660 100%)",
        }}
      >
        {/* Background pattern */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Decorative Circle */}
        <div
          className="absolute right-0 top-0 w-96 h-96 rounded-full opacity-10"
          style={{
            background: "radial-gradient(circle, #F48C06 0%, transparent 70%)",
            transform: "translate(30%, -30%)",
          }}
        />

        <div className="relative max-w-7xl mx-auto">
          <div className="max-w-3xl">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
              style={{
                background: "rgba(232, 93, 4, 0.15)",
                border: "1px solid rgba(232, 93, 4, 0.3)",
                color: "#F48C06",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
              100+ Plants · Pan-India · 25+ Years
            </div>

            <h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight"
            >
              Concrete You Can{" "}
              <span
                className="inline-block"
                style={{
                  background: "linear-gradient(135deg, #E85D04 0%, #F48C06 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Trust
              </span>
              ,<br />
              Delivered to Your Site
            </h1>

            <p className="text-lg text-blue-200 mb-8 max-w-2xl leading-relaxed">
              India&apos;s leading ready-mix concrete company. Quality-assured, digitally tracked,
              and delivered on time — for housing, infrastructure, and industrial projects
              across the nation.
            </p>

            <div className="flex flex-wrap gap-4">
              <button
                className="px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 hover:scale-105"
                style={{
                  background: "linear-gradient(135deg, #E85D04 0%, #F48C06 100%)",
                  boxShadow: "0 8px 24px rgba(232, 93, 4, 0.35)",
                }}
              >
                Get a Quote →
              </button>
              <button
                className="px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:bg-white/10"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  backdropFilter: "blur(8px)",
                }}
              >
                Find Nearest Plant
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12">
              {STATS.map((stat) => (
                <div key={stat.value} className="text-center md:text-left">
                  <div
                    className="text-3xl font-bold"
                    style={{
                      background: "linear-gradient(135deg, #F48C06 0%, #FBBF24 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {stat.value}
                  </div>
                  <div className="text-blue-200 text-sm mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">
              Why Choose RDC Concrete?
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              From digital ordering to real-time delivery tracking — every step is designed
              to make your construction smoother, faster, and better.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-2xl border bg-white transition-all hover:-translate-y-1 hover:shadow-lg"
                style={{ borderColor: "#E2E8F0" }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 text-white"
                  style={{
                    background: "linear-gradient(135deg, #E85D04 0%, #F48C06 100%)",
                  }}
                >
                  <feature.icon size={20} />
                </div>
                <h3 className="font-semibold text-gray-800 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Services ─────────────────────────────────────────────────────── */}
      <section
        className="py-20 px-4"
        style={{ background: "linear-gradient(135deg, #0F1E35 0%, #1B2A4A 100%)" }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Our Products & Services
            </h2>
            <p className="text-blue-200 max-w-2xl mx-auto">
              Comprehensive ready-mix concrete solutions backed by technology and trust.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SERVICES.map((service, i) => (
              <div
                key={service.name}
                className="p-5 rounded-xl transition-all hover:bg-white/10 cursor-pointer"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <div
                  className="text-xs font-bold mb-2"
                  style={{ color: "#F48C06" }}
                >
                  0{i + 1}
                </div>
                <h3 className="font-semibold text-white mb-1.5">{service.name}</h3>
                <p className="text-sm text-blue-200">{service.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Locations ────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">
              Pan-India Presence
            </h2>
            <p className="text-gray-500">Serving major cities and growing every month.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {LOCATIONS.map((city) => (
              <div
                key={city}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-gray-600 border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-all cursor-pointer"
                style={{ background: "#F8FAFC" }}
              >
                <MapPin size={12} />
                {city}
              </div>
            ))}
            <div
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold"
              style={{
                background: "linear-gradient(135deg, #E85D04 0%, #F48C06 100%)",
                color: "white",
              }}
            >
              + Many more
            </div>
          </div>
        </div>
      </section>

      {/* ── Contact Banner ───────────────────────────────────────────────── */}
      <section id="contact" className="py-16 px-4" style={{ background: "#F1F5F9" }}>
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Ready to Get Started?</h2>
          <p className="text-gray-500 text-sm mb-8">
            Chat with RDC Saathi (bottom right corner) for instant answers,
            or reach us directly:
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            <a
              href="tel:+912267896789"
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #1B2A4A 0%, #243660 100%)" }}
            >
              <Phone size={16} /> +91 22 6789 6789
            </a>
            <a
              href={FACTS.contactPage}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium text-gray-700 border border-gray-300 bg-white hover:border-orange-300 hover:text-orange-600 transition-all"
            >
              <Mail size={16} /> {FACTS.contactPage.replace("https://", "")}
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer
        className="py-8 px-4 text-center text-sm"
        style={{ background: "#0F1E35", color: "rgba(255,255,255,0.4)" }}
      >
        <p>© 2025 RDC Concrete (India) Limited. All Rights Reserved.</p>
        <p className="mt-1 text-xs">
          7th Floor, Thane One Corporate IT Park, Ghodbunder Road, Kapurbawdi, Thane (W) 400 610
        </p>
        <div className="mt-3 flex justify-center gap-4 text-xs">
          <a href="/admin" className="hover:text-white/70 transition-colors">
            Admin Panel
          </a>
          <span>·</span>
          <a href="#" className="hover:text-white/70 transition-colors">
            Privacy Policy
          </a>
          <span>·</span>
          <span style={{ color: "rgba(244,140,6,0.7)" }}>
            Powered by RDC Saathi AI
          </span>
        </div>
      </footer>

      {/* ── Chat Widget (Floating) ────────────────────────────────────────── */}
      <ChatWidget />
    </div>
  );
}
