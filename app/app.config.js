export default {
  expo: {
    name: "LifeTime",
    slug: "app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/LifeTime-icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: false,
    splash: {
      image: "./assets/LifeTime-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      "bundleIdentifier": "com.LifeTime.app"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/LifeTime-icon.png",
        backgroundColor: "#ffffff"
      },
      config: {
        googleMaps: {
          // ¡Aquí está la magia! Sin comillas, lee tu .env local
          apiKey: process.env.GOOGLE_API_KEY
        }
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.LifeTime.app",
      googleRenderer: "LEGACY"
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-secure-store",
      "expo-asset",
      "expo-font",
      "expo-notifications",
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow LifeTime to use your location to show your position on the map.",
          "locationWhenInUsePermission": "Allow LifeTime to use your location to show your position on the map."
        }
      ]
    ],
    extra: {
      eas: {
        projectId: "dcae0b8d-5eae-4f69-8733-25fe1506c535"
      }
    }
  }
};