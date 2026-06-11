import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { theme } from '../shared/lib/theme';
import {
  getFriends,
  getReceivedRequests,
  removeFriend,
  acceptFriendRequest,
  rejectFriendRequest,
} from '../features/friends/friends.service';
import {
  onFriendRequestReceived,
  onFriendRequestAccepted,
  onFriendRemoved,
  onFriendStatusChanged,
} from '../features/friends/friends.socket.service';
import type {
  Friend,
  FriendRequest,
  FriendRequestReceivedPayload,
  FriendRequestAcceptedPayload,
  FriendRemovedPayload,
  FriendStatusChangedPayload,
} from '../features/friends/friends.types';

type SocialScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Social'>;

interface SocialScreenProps {
  navigation: SocialScreenNavigationProp;
}

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3000';
const DEFAULT_AVATAR = '/defaults/default-avatar.png';

const getImageUrl = (imageUrl: string | null): string => {
  if (!imageUrl || imageUrl.trim() === '') {
    return `${SERVER_URL}${DEFAULT_AVATAR}`;
  }
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${SERVER_URL}${imageUrl}`;
};

export default function SocialScreen({ navigation }: SocialScreenProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'friends' | 'requests'>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [friendsData, requestsData] = await Promise.all([
        getFriends(),
        getReceivedRequests(),
      ]);
      setFriends(friendsData);
      setRequests(requestsData);
    } catch (err) {
      console.error('Failed to load social data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const unsubRequestReceived = onFriendRequestReceived((payload: FriendRequestReceivedPayload) => {
      setRequests((prev) => {
        if (prev.some((r) => r.id === payload.requestId)) return prev;
        return [
          {
            id: payload.requestId,
            senderId: payload.senderId,
            profile: {
              id: 0,
              name: payload.senderName,
              imageUrl: payload.senderImageUrl,
            },
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ];
      });
    });

    const unsubRequestAccepted = onFriendRequestAccepted((payload: FriendRequestAcceptedPayload) => {
      setFriends((prev) => {
        if (prev.some((f) => f.userId === payload.friendId)) return prev;
        return [
          ...prev,
          {
            id: 0,
            userId: payload.friendId,
            profile: {
              id: 0,
              name: payload.friendName,
              imageUrl: payload.friendImageUrl,
            },
            isOnline: true,
          },
        ];
      });
    });

    const unsubFriendRemoved = onFriendRemoved((payload: FriendRemovedPayload) => {
      setFriends((prev) => prev.filter((f) => f.userId !== payload.friendId));
    });

    const unsubStatusChanged = onFriendStatusChanged((payload: FriendStatusChangedPayload) => {
      setFriends((prev) =>
        prev.map((f) =>
          f.userId === payload.friendId ? { ...f, isOnline: payload.isOnline } : f
        )
      );
    });

    return () => {
      unsubRequestReceived();
      unsubRequestAccepted();
      unsubFriendRemoved();
      unsubStatusChanged();
    };
  }, []);

  const handleRemoveFriend = (friend: Friend) => {
    Alert.alert(
      'Remove friend',
      `Are you sure you want to remove ${friend.profile.name} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFriend(friend.userId);
              setFriends((prev) => prev.filter((f) => f.userId !== friend.userId));
            } catch {
              Alert.alert('Error', 'Could not remove friend');
            }
          },
        },
      ]
    );
  };

  const handleAcceptRequest = async (request: FriendRequest) => {
    try {
      await acceptFriendRequest(request.id);
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
      setFriends((prev) => [
        ...prev,
        {
          id: 0,
          userId: request.senderId,
          profile: request.profile,
          isOnline: true,
        },
      ]);
    } catch {
      Alert.alert('Error', 'Could not accept request');
    }
  };

  const handleRejectRequest = async (request: FriendRequest) => {
    try {
      await rejectFriendRequest(request.id);
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch {
      Alert.alert('Error', 'Could not reject request');
    }
  };

  const renderFriendItem = ({ item }: { item: Friend }) => (
    <View style={styles.itemRow}>
      <Image source={{ uri: getImageUrl(item.profile.imageUrl) }} style={styles.itemAvatar} />
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.profile.name}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.onlineDot, item.isOnline ? styles.onlineDotActive : styles.onlineDotInactive]} />
          <Text style={styles.statusText}>{item.isOnline ? 'Online' : 'Offline'}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => handleRemoveFriend(item)}
        activeOpacity={0.75}
      >
        <Feather name="trash-2" size={20} color={theme.colors.danger} />
      </TouchableOpacity>
    </View>
  );

  const renderRequestItem = ({ item }: { item: FriendRequest }) => (
    <View style={styles.itemRow}>
      <Image source={{ uri: getImageUrl(item.profile.imageUrl) }} style={styles.itemAvatar} />
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.profile.name}</Text>
        <Text style={styles.statusText}>Friend request</Text>
      </View>
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, styles.acceptButton]}
          onPress={() => handleAcceptRequest(item)}
          activeOpacity={0.75}
        >
          <Feather name="check" size={20} color={theme.colors.success} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton]}
          onPress={() => handleRejectRequest(item)}
          activeOpacity={0.75}
        >
          <Feather name="x" size={20} color={theme.colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmpty = (message: string) => (
    <View style={styles.emptyContainer}>
      <Feather name="users" size={48} color={theme.colors.textMuted} />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );

  const requestCount = requests.length;

  return (
    <LinearGradient
      colors={[theme.colors.surface, theme.colors.background]}
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Social</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'friends' && styles.tabActive]}
          onPress={() => setActiveTab('friends')}
          activeOpacity={0.75}
        >
          <Text style={[styles.tabText, activeTab === 'friends' && styles.tabTextActive]}>
            Friends
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'requests' && styles.tabActive]}
          onPress={() => setActiveTab('requests')}
          activeOpacity={0.75}
        >
          <View style={styles.tabWithBadge}>
            <Text style={[styles.tabText, activeTab === 'requests' && styles.tabTextActive]}>
              Requests
            </Text>
            {requestCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{requestCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <>
          {activeTab === 'friends' && (
            <FlatList
              data={friends}
              keyExtractor={(item) => String(item.userId)}
              renderItem={renderFriendItem}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={renderEmpty('No friends yet')}
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadData();
              }}
            />
          )}
          {activeTab === 'requests' && (
            <FlatList
              data={requests}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderRequestItem}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={renderEmpty('No pending requests')}
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadData();
              }}
            />
          )}
        </>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: 4,
    minWidth: 32,
    minHeight: 32,
    justifyContent: 'center',
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: theme.colors.primary,
  },
  tabText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
  },
  tabTextActive: {
    color: '#000',
    fontWeight: theme.typography.fontWeight.bold,
  },
  tabWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    backgroundColor: theme.colors.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: theme.typography.fontWeight.bold,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    flexGrow: 1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 12,
  },
  itemAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceAlt,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  onlineDotActive: {
    backgroundColor: theme.colors.success,
  },
  onlineDotInactive: {
    backgroundColor: theme.colors.textMuted,
  },
  statusText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.fontSize.sm,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
  },
  rejectButton: {
    backgroundColor: 'rgba(186, 21, 21, 0.2)',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 16,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.fontSize.base,
  },
});
