import React from 'react';

export default function DataPrivacyTab() {
  return (
    <div className="space-y-8">
      {/* Data Request Workflows */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-gray-400">gavel</span>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Data Request Workflows</h2>
              <p className="text-xs text-gray-500">Define authorization levels for sensitive data operations like GDPR exports and permanent deletions.</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-100 uppercase">Compliance Active</span>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Data Export Approvals</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-sm">lock</span>
                <select className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none appearance-none">
                  <option>Security Team only</option>
                  <option>Any Admin</option>
                  <option>Two-factor required</option>
                </select>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Who must approve a full customer data dump request.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Account Deletion Approvals</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-sm">delete_forever</span>
                <select className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none appearance-none">
                  <option>Security Team only</option>
                  <option>Any Admin</option>
                  <option>Two-factor required</option>
                </select>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Required authorization for "Right to be Forgotten" requests.</p>
            </div>
          </div>
          <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 p-4 flex gap-4">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white flex-shrink-0">
              <span className="material-symbols-outlined text-lg">info</span>
            </div>
            <div>
              <h3 className="text-xs font-bold text-indigo-900 dark:text-indigo-200 mb-1">Approval Workflow Active</h3>
              <p className="text-[10px] text-indigo-800/70 dark:text-indigo-300/70 leading-relaxed">Requests triggering these rules will create a high-priority ticket in the Security Inbox requiring manual sign-off.</p>
            </div>
          </div>
        </div>
      </section>

      {/* PII & Redaction */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
          <span className="material-symbols-outlined text-gray-400">visibility_off</span>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">PII & Redaction</h2>
            <p className="text-xs text-gray-500">Configure automated masking rules for Personally Identifiable Information in logs and chat.</p>
          </div>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          <div className="p-6 flex items-center justify-between group hover:bg-gray-50/50 transition-colors">
            <div className="flex-1 pr-8">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Auto-mask sensitive fields in logs</h3>
              <p className="text-xs text-gray-500">Automatically detects and hashes emails, phone numbers, and IP addresses in system audit logs before storage.</p>
            </div>
            <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-indigo-600 transition-colors focus:outline-none">
              <span className="translate-x-6 inline-block h-4 w-4 transform rounded-full bg-white transition-transform"></span>
            </button>
          </div>
          <div className="p-6 flex items-center justify-between group hover:bg-gray-50/50 transition-colors">
            <div className="flex-1 pr-8">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Redact credit card numbers in chat</h3>
              <p className="text-xs text-gray-500">Real-time detection using Luhn algorithm to replace 16-digit sequences with <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">****-****-****-1234</code> in agent views.</p>
            </div>
            <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-indigo-600 transition-colors focus:outline-none">
              <span className="translate-x-6 inline-block h-4 w-4 transform rounded-full bg-white transition-transform"></span>
            </button>
          </div>
          <div className="p-6 flex items-center justify-between group hover:bg-gray-50/50 transition-colors opacity-50">
            <div className="flex-1 pr-8">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Voice PII Redaction</h3>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 uppercase">Enterprise Plan</span>
              </div>
              <p className="text-xs text-gray-500">Scrub audio recordings for sensitive data before archival.</p>
            </div>
            <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 dark:bg-gray-700 transition-colors focus:outline-none">
              <span className="translate-x-1 inline-block h-4 w-4 transform rounded-full bg-white transition-transform"></span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
