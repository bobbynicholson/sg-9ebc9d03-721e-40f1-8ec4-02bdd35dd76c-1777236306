import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, Search, ArrowLeft, UtensilsCrossed, ChefHat } from "lucide-react";
import { useEffect, useState } from "react";

export default function Custom404() {
  const [rotation, setRotation] = useState(0);
  const [bounce, setBounce] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((prev) => (prev + 1) % 360);
    }, 50);

    const bounceInterval = setInterval(() => {
      setBounce((prev) => !prev);
    }, 2000);

    return () => {
      clearInterval(interval);
      clearInterval(bounceInterval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center p-4 overflow-hidden relative">
      {/* Floating food items in background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-20 left-10 text-6xl opacity-10 animate-float"
          style={{ animationDelay: "0s" }}
        >
          🍕
        </div>
        <div
          className="absolute top-40 right-20 text-5xl opacity-10 animate-float"
          style={{ animationDelay: "1s" }}
        >
          🍔
        </div>
        <div
          className="absolute bottom-40 left-20 text-7xl opacity-10 animate-float"
          style={{ animationDelay: "2s" }}
        >
          🥗
        </div>
        <div
          className="absolute bottom-20 right-40 text-6xl opacity-10 animate-float"
          style={{ animationDelay: "1.5s" }}
        >
          🍰
        </div>
        <div
          className="absolute top-1/3 left-1/4 text-5xl opacity-10 animate-float"
          style={{ animationDelay: "0.5s" }}
        >
          🍝
        </div>
        <div
          className="absolute top-1/2 right-1/3 text-6xl opacity-10 animate-float"
          style={{ animationDelay: "2.5s" }}
        >
          🥘
        </div>
      </div>

      <div className="max-w-2xl w-full text-center relative z-10">
        {/* Animated chef hat spinning */}
        <div className="mb-8 flex justify-center">
          <div
            className="relative"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <ChefHat className="w-24 h-24 text-orange-500" strokeWidth={1.5} />
            <div className="absolute inset-0 animate-ping opacity-20">
              <ChefHat className="w-24 h-24 text-orange-400" strokeWidth={1.5} />
            </div>
          </div>
        </div>

        {/* Main 404 heading with bouncing utensils */}
        <div className="relative inline-block mb-6">
          <div className={`transition-transform duration-500 ${bounce ? "scale-110" : "scale-100"}`}>
            <h1 className="text-9xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-600 via-amber-500 to-yellow-600 leading-none mb-4">
              4
              <span className="inline-block mx-2">
                <UtensilsCrossed className="w-20 h-20 inline text-orange-500" />
              </span>
              4
            </h1>
          </div>
          <div className="absolute -top-4 -left-4 text-4xl animate-bounce">🍴</div>
          <div className="absolute -top-4 -right-4 text-4xl animate-bounce" style={{ animationDelay: "0.2s" }}>🥄</div>
          <div className="absolute -bottom-4 -left-8 text-4xl animate-bounce" style={{ animationDelay: "0.4s" }}>🔪</div>
          <div className="absolute -bottom-4 -right-8 text-4xl animate-bounce" style={{ animationDelay: "0.6s" }}>🍷</div>
        </div>

        <h2 className="text-3xl font-bold text-gray-800 mb-4">
          Oops! This Page is Off the Menu
        </h2>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 mb-8 shadow-lg border-2 border-orange-200">
          <p className="text-lg text-gray-700 mb-4 leading-relaxed">
            Looks like someone sent this page to the wrong kitchen. We searched everywhere – checked the walk-in freezer, looked under the prep tables, even asked the dishwasher. No luck.
          </p>

          <div className="bg-gradient-to-r from-orange-100 to-amber-100 rounded-lg p-6 mb-6 border border-orange-300">
            <p className="text-gray-800 font-medium mb-3">
              🎯 <strong>Chef&apos;s Suggestions:</strong>
            </p>
            <ul className="text-left space-y-2 text-gray-700">
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>The URL might have been plated incorrectly (check for typos)</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>This dish might have been 86&apos;d from our menu</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Perhaps you clicked a link that&apos;s past its expiry date</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>The page delivery got lost between the kitchen and your table</span>
              </li>
            </ul>
          </div>

          <p className="text-gray-600 italic mb-6">
            &quot;A recipe for disaster: 1 cup of broken links, a pinch of confusion, served with a side of 404.&quot;
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                <Home className="mr-2 h-5 w-5" />
                Back to Main Course
              </Button>
            </Link>
            
            <Button 
              onClick={() => window.history.back()}
              variant="outline" 
              size="lg"
              className="border-2 border-orange-400 hover:bg-orange-50 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
            >
              <ArrowLeft className="mr-2 h-5 w-5" />
              Previous Page
            </Button>
          </div>
        </div>

        {/* Fun fact section */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-6 border border-orange-200">
          <p className="text-sm text-gray-600 mb-2">
            <span className="font-semibold">Fun Fact:</span> While you&apos;re here...
          </p>
          <p className="text-gray-700">
            Did you know that catering companies typically plan for 15-20% food waste to ensure no guest goes hungry? Unlike this page, we always deliver what we promise! 🎉
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-30px) rotate(10deg);
          }
        }

        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
