import React from 'react';

export default function Home() {
  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex items-center justify-between px-4 py-2 bg-purple-100 dark:bg-purple-900/40 rounded-t-xl mx-2 mt-2 mb-2 border border-purple-200 dark:border-purple-800/50">
        <div className="text-sm text-gray-800 dark:text-gray-200">
          You have <span className="font-bold">12 days left</span> in your <a className="underline decoration-1 underline-offset-2 hover:text-purple-700 dark:hover:text-purple-300" href="#">Advanced trial</a>. Includes unlimited Fin usage.
        </div>
        <div className="flex items-center space-x-4">
          <button className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white underline decoration-1 underline-offset-2">Talk to sales</button>
          <button className="bg-primary text-white text-sm font-medium px-4 py-1.5 rounded-full hover:bg-black dark:hover:bg-gray-700 transition-colors">Buy Intercom</button>
        </div>
      </div>
      <div className="flex-1 bg-card-light dark:bg-card-dark rounded-2xl mx-2 shadow-sm overflow-y-auto custom-scrollbar relative">
        <div className="max-w-5xl mx-auto px-12 py-12">
          <h1 className="font-display text-4xl text-gray-900 dark:text-white mb-8 text-center leading-tight">
            Get started with AI-first customer support
          </h1>
          <div className="flex items-center mb-6 pl-4">
            <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 mr-3"></div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Get set up</h2>
            <span className="mx-2 text-gray-400">•</span>
            <span className="text-gray-500 dark:text-gray-400">0 / 5 steps</span>
          </div>
          <div className="space-y-4">
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm bg-white dark:bg-gray-800 transition-all duration-300">
              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                  <div className="flex items-start mb-2">
                    <div className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-500 mr-3 mt-0.5 flex-shrink-0"></div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Set up channels to connect with your customers</h3>
                  </div>
                  <div className="ml-9">
                    <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-4">
                      Manage conversations across all channels: Messenger, email, phone, WhatsApp, SMS, and social. Support your customers wherever they are, directly from your Intercom Inbox. <a className="underline decoration-gray-400 hover:text-gray-900 dark:hover:text-white" href="#">More about channels</a>
                    </p>
                    <button className="bg-primary text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
                      Set up channels
                    </button>
                  </div>
                </div>
                <div className="md:w-64 lg:w-72 flex-shrink-0 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden relative group cursor-pointer border border-gray-100 dark:border-gray-600">
                  <img alt="Dashboard Preview Abstract" className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-500" src="https://picsum.photos/seed/intercom/600/400" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                  <div className="absolute top-4 right-4 left-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 text-xs opacity-95">
                    <div className="flex justify-between items-center mb-2 text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 pb-1">
                      <span>Views</span>
                      <span className="material-icons-outlined text-sm">expand_more</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between p-1 bg-gray-100 dark:bg-gray-700 rounded">
                        <div className="flex items-center gap-1">
                          <span className="material-icons-outlined text-blue-500 text-xs">public</span>
                          <span className="font-medium text-gray-800 dark:text-gray-200">All channels</span>
                        </div>
                        <span className="text-gray-400">47</span>
                      </div>
                      <div className="flex items-center justify-between p-1">
                        <div className="flex items-center gap-1">
                          <span className="material-icons-outlined text-gray-400 text-xs">chat_bubble_outline</span>
                          <span className="text-gray-600 dark:text-gray-300">Messenger</span>
                        </div>
                        <span className="text-gray-400">21</span>
                      </div>
                      <div className="flex items-center justify-between p-1">
                        <div className="flex items-center gap-1">
                          <span className="material-icons-outlined text-gray-400 text-xs">mail_outline</span>
                          <span className="text-gray-600 dark:text-gray-300">Email</span>
                        </div>
                        <span className="text-gray-400">14</span>
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 bg-black/30 dark:bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                      <span className="material-icons-outlined text-white text-2xl">play_arrow</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-b border-gray-100 dark:border-gray-800 last:border-0 py-4 px-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg cursor-pointer group transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 mr-3 group-hover:border-gray-400 dark:group-hover:border-gray-500"></div>
                  <span className="font-medium text-gray-800 dark:text-gray-200">Invite your teammates to collaborate faster</span>
                </div>
                <span className="material-icons-outlined text-gray-400 dark:text-gray-600 transform rotate-0 group-hover:text-gray-600 dark:group-hover:text-gray-300">chevron_right</span>
              </div>
            </div>
            <div className="border-b border-gray-100 dark:border-gray-800 last:border-0 py-4 px-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg cursor-pointer group transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 mr-3 group-hover:border-gray-400 dark:group-hover:border-gray-500"></div>
                  <span className="font-medium text-gray-800 dark:text-gray-200">Add content from Zendesk to power your AI</span>
                </div>
                <span className="material-icons-outlined text-gray-400 dark:text-gray-600 transform rotate-0 group-hover:text-gray-600 dark:group-hover:text-gray-300">chevron_right</span>
              </div>
            </div>
            <div className="border-b border-gray-100 dark:border-gray-800 last:border-0 py-4 px-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg cursor-pointer group transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 mr-3 group-hover:border-gray-400 dark:group-hover:border-gray-500"></div>
                  <span className="font-medium text-gray-800 dark:text-gray-200">Set up Fin to give instant answers</span>
                </div>
                <span className="material-icons-outlined text-gray-400 dark:text-gray-600 transform rotate-0 group-hover:text-gray-600 dark:group-hover:text-gray-300">chevron_right</span>
              </div>
            </div>
            <div className="border-b border-gray-100 dark:border-gray-800 last:border-0 py-4 px-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg cursor-pointer group transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 mr-3 group-hover:border-gray-400 dark:group-hover:border-gray-500"></div>
                  <span className="font-medium text-gray-800 dark:text-gray-200">Ask Copilot to find an answer instantly</span>
                </div>
                <span className="material-icons-outlined text-gray-400 dark:text-gray-600 transform rotate-0 group-hover:text-gray-600 dark:group-hover:text-gray-300">chevron_right</span>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute bottom-6 right-8">
          <button className="w-14 h-14 bg-black dark:bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
            <span className="material-icons-outlined text-white dark:text-black text-2xl">chat</span>
          </button>
        </div>
        <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-16 h-1 bg-gray-300 dark:bg-gray-600 rounded-full opacity-50"></div>
      </div>
    </div>
  );
}
