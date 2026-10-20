import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../lib/supabase";
import { colors, fonts } from "../constants/theme";

import AuthScreen from "../screens/AuthScreen";
import RecordScreen from "../screens/RecordScreen";
import LibraryScreen from "../screens/LibraryScreen";
import LectureDetailScreen from "../screens/LectureDetailScreen";
import TopicDetailScreen from "../screens/TopicDetailScreen";
import ConfusionReviewScreen from "../screens/ConfusionReviewScreen";
import ProfileScreen from "../screens/ProfileScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const screenHeaderOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerShadowVisible: false,
  headerTintColor: colors.text,
  headerTitleStyle: { fontFamily: fonts.bodySemiBold, fontSize: 17 },
};

// ============ Avatar button: entry point into user management (Profile/Logout) ============
function AvatarButton({ navigation }) {
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate("Profile")}
      style={avatarStyles.button}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="person" size={16} color={colors.primary} />
    </TouchableOpacity>
  );
}

const avatarStyles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
});

function RecordStack() {
  return (
    <Stack.Navigator screenOptions={screenHeaderOptions}>
      <Stack.Screen
        name="RecordHome"
        component={RecordScreen}
        options={({ navigation }) => ({
          title: "Record",
          headerRight: () => <AvatarButton navigation={navigation} />,
        })}
      />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Account" }} />
    </Stack.Navigator>
  );
}

function LibraryStack() {
  return (
    <Stack.Navigator screenOptions={screenHeaderOptions}>
      <Stack.Screen
        name="LibraryHome"
        component={LibraryScreen}
        options={({ navigation }) => ({
          title: "Library",
          headerRight: () => <AvatarButton navigation={navigation} />,
        })}
      />
      <Stack.Screen name="LectureDetail" component={LectureDetailScreen} />
      <Stack.Screen name="TopicDetail" component={TopicDetailScreen} />
      <Stack.Screen
        name="ConfusionReview"
        component={ConfusionReviewScreen}
        options={{ title: "Flagged Moments" }}
      />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Account" }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarIcon: ({ color, size }) => {
          const icon = route.name === "Record" ? "mic" : "library";
          return <Ionicons name={icon} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Record" component={RecordStack} />
      <Tab.Screen name="Library" component={LibraryStack} />
    </Tab.Navigator>
  );
}

export default function RootNavigation() {
  const [session, setSession] = useState(undefined); // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <NavigationContainer>{session ? <MainTabs /> : <AuthScreen />}</NavigationContainer>;
}
