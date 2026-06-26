import { supabase } from '@/src/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type CommunityPost = {
  id: string;
  user_id: string;
  content: string;
  author_name: string | null;
  author_avatar_url: string | null;
  created_at: string;
  likes_count: number;
  liked_by_me: boolean;
};

type SupabasePostRow = {
  id: string;
  user_id: string;
  content: string;
  author_name: string | null;
  author_avatar_url: string | null;
  created_at: string;
};

type SupabaseLikeRow = {
  post_id: string;
  user_id: string;
};

type ProfileRow = {
  full_name: string | null;
  avatar_url: string | null;
};

export default function Home() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('Comunidad');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [newPost, setNewPost] = useState('');
  const [posts, setPosts] = useState<CommunityPost[]>([]);

  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const initials = useMemo(() => {
    const cleanName = displayName.trim();

    if (!cleanName || cleanName === 'Comunidad') return 'A';

    return cleanName
      .split(' ')
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('');
  }, [displayName]);

  const formatDate = (value: string) => {
    const date = new Date(value);

    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPostInitial = (name?: string | null) => {
    if (!name?.trim()) return 'A';

    return name
      .trim()
      .split(' ')
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('');
  };

  const loadCurrentUser = useCallback(async () => {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      router.replace('/sign-in');
      return null;
    }

    const currentUser = data.user;

    setUserId(currentUser.id);

    const metadataName =
      currentUser.user_metadata?.full_name ||
      currentUser.user_metadata?.name ||
      currentUser.email?.split('@')[0] ||
      'Comunidad';

    const metadataAvatar = currentUser.user_metadata?.avatar_url || null;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', currentUser.id)
      .maybeSingle();

    const profile = profileData as ProfileRow | null;

    const finalName = profile?.full_name || metadataName;
    const finalAvatar = profile?.avatar_url || metadataAvatar;

    setDisplayName(finalName);
    setAvatarUrl(finalAvatar);

    return {
      id: currentUser.id,
      name: finalName,
      avatar: finalAvatar,
    };
  }, [router]);

  const loadFeed = useCallback(async (activeUserId: string) => {
    const { data: postsData, error: postsError } = await supabase
      .from('community_posts')
      .select('id, user_id, content, author_name, author_avatar_url, created_at')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (postsError) {
      Alert.alert('Error al cargar publicaciones', postsError.message);
      return;
    }

    const rows = (postsData || []) as SupabasePostRow[];
    const postIds = rows.map((post) => post.id);

    let likesData: SupabaseLikeRow[] = [];

    if (postIds.length > 0) {
      const { data: likesRows, error: likesError } = await supabase
        .from('post_likes')
        .select('post_id, user_id')
        .in('post_id', postIds);

      if (likesError) {
        Alert.alert('Error al cargar likes', likesError.message);
        return;
      }

      likesData = (likesRows || []) as SupabaseLikeRow[];
    }

    const formattedPosts: CommunityPost[] = rows.map((post) => {
      const postLikes = likesData.filter((like) => like.post_id === post.id);
      const likedByMe = postLikes.some((like) => like.user_id === activeUserId);

      return {
        id: post.id,
        user_id: post.user_id,
        content: post.content,
        author_name: post.author_name || 'Usuaria de Aura',
        author_avatar_url: post.author_avatar_url || null,
        created_at: post.created_at,
        likes_count: postLikes.length,
        liked_by_me: likedByMe,
      };
    });

    setPosts(formattedPosts);
  }, []);

  const initialize = useCallback(async () => {
    try {
      setLoading(true);

      const currentUser = await loadCurrentUser();

      if (currentUser) {
        await loadFeed(currentUser.id);
      }
    } finally {
      setLoading(false);
    }
  }, [loadCurrentUser, loadFeed]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const onRefresh = async () => {
    if (!userId) return;

    try {
      setRefreshing(true);
      await loadCurrentUser();
      await loadFeed(userId);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreatePost = async () => {
    const content = newPost.trim();

    if (!userId) {
      Alert.alert('Sesión requerida', 'Debes iniciar sesión nuevamente.');
      router.replace('/sign-in');
      return;
    }

    if (content.length < 3) {
      Alert.alert('Publicación muy corta', 'Escribe un mensaje un poco más completo.');
      return;
    }

    if (content.length > 280) {
      Alert.alert('Publicación muy larga', 'Por ahora usa máximo 280 caracteres.');
      return;
    }

    try {
      setPublishing(true);

      const { error } = await supabase.from('community_posts').insert({
        user_id: userId,
        content,
        visibility: 'community',
        author_name: displayName,
        author_avatar_url: avatarUrl,
      });

      if (error) {
        Alert.alert('No se pudo publicar', error.message);
        return;
      }

      setNewPost('');
      await loadFeed(userId);
    } finally {
      setPublishing(false);
    }
  };

  const handleToggleLike = async (post: CommunityPost) => {
    if (!userId) {
      Alert.alert('Sesión requerida', 'Debes iniciar sesión nuevamente.');
      return;
    }

    const previousPosts = posts;

    setPosts((currentPosts) =>
      currentPosts.map((item) => {
        if (item.id !== post.id) return item;

        return {
          ...item,
          liked_by_me: !item.liked_by_me,
          likes_count: item.liked_by_me
            ? Math.max(item.likes_count - 1, 0)
            : item.likes_count + 1,
        };
      })
    );

    if (post.liked_by_me) {
      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', post.id)
        .eq('user_id', userId);

      if (error) {
        setPosts(previousPosts);
        Alert.alert('No se pudo quitar el like', error.message);
      }

      return;
    }

    const { error } = await supabase.from('post_likes').insert({
      post_id: post.id,
      user_id: userId,
    });

    if (error) {
      setPosts(previousPosts);
      Alert.alert('No se pudo dar like', error.message);
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert('No se pudo cerrar sesión', error.message);
      return;
    }

    router.replace('/');
  };

  const openAccompaniment = () => {
    Alert.alert(
      'Acompañamiento',
      'En el siguiente paso conectamos esta entrada con la pantalla de acompañamiento.'
    );
  };

  const renderAvatar = ({
    imageUrl,
    name,
    size = 46,
    radius = 17,
    subtle = false,
  }: {
    imageUrl?: string | null;
    name?: string | null;
    size?: number;
    radius?: number;
    subtle?: boolean;
  }) => {
    return (
      <View
        style={[
          styles.avatarBase,
          {
            width: size,
            height: size,
            borderRadius: radius,
          },
          subtle && styles.avatarSubtle,
        ]}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{
              width: size,
              height: size,
              borderRadius: radius,
            }}
          />
        ) : (
          <Text style={styles.avatarBaseText}>{getPostInitial(name)}</Text>
        )}
      </View>
    );
  };

  const renderPost = ({ item }: { item: CommunityPost }) => {
    const isMine = item.user_id === userId;
    const postAvatar = isMine ? avatarUrl || item.author_avatar_url : item.author_avatar_url;

    return (
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          {renderAvatar({
            imageUrl: postAvatar,
            name: item.author_name,
            size: 44,
            radius: 16,
          })}

          <View style={styles.postHeaderText}>
            <Text style={styles.authorName}>
              {item.author_name || 'Usuaria de Aura'}
            </Text>
            <Text style={styles.postDate}>
              {formatDate(item.created_at)} {isMine ? '· Tu publicación' : ''}
            </Text>
          </View>

          <TouchableOpacity activeOpacity={0.8}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#E9D5FF" />
          </TouchableOpacity>
        </View>

        <Text style={styles.postContent}>{item.content}</Text>

        <View style={styles.postActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleToggleLike(item)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={item.liked_by_me ? 'heart' : 'heart-outline'}
              size={21}
              color={item.liked_by_me ? '#FF7AB6' : '#E9D5FF'}
            />
            <Text style={styles.actionText}>{item.likes_count}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() =>
              Alert.alert('Comentarios', 'Después conectamos la pantalla de comentarios.')
            }
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-outline" size={20} color="#E9D5FF" />
            <Text style={styles.actionText}>Comentar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() =>
              Alert.alert('Guardar', 'Después conectamos publicaciones guardadas.')
            }
            activeOpacity={0.8}
          >
            <Ionicons name="bookmark-outline" size={20} color="#E9D5FF" />
            <Text style={styles.actionText}>Guardar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderHeader = () => {
    return (
      <View>
        <View style={styles.topBar}>
          <View style={styles.topTextBox}>
            <Text style={styles.greeting}>Hola, {displayName}</Text>
            <Text style={styles.appTitle}>Aura Púrpura</Text>
          </View>

          <View style={styles.topActions}>
            <TouchableOpacity
              style={styles.profileButton}
              activeOpacity={0.85}
              onPress={() =>
                Alert.alert(
                  'Perfil',
                  'Luego conectamos esta foto con la pantalla de perfil.'
                )
              }
            >
              {renderAvatar({
                imageUrl: avatarUrl,
                name: displayName,
                size: 48,
                radius: 18,
                subtle: true,
              })}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleSignOut}
              activeOpacity={0.8}
            >
              <Ionicons name="log-out-outline" size={21} color="#F5EFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.accompanimentCard}
          activeOpacity={0.9}
          onPress={openAccompaniment}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.06)']}
            style={styles.accompanimentGradient}
          >
            <View style={styles.accompanimentIcon}>
              <Ionicons name="shield-checkmark-outline" size={25} color="#FFFFFF" />
            </View>

            <View style={styles.accompanimentTextBox}>
              <Text style={styles.accompanimentTitle}>Nunca caminas sola</Text>
              <Text style={styles.accompanimentSubtitle}>
                Inicia una sesión de acompañamiento cuando lo necesites.
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.composerCard}>
          <View style={styles.composerHeader}>
            {renderAvatar({
              imageUrl: avatarUrl,
              name: displayName,
              size: 46,
              radius: 17,
            })}

            <View style={styles.composerTitleBox}>
              <Text style={styles.composerTitle}>Comparte con la comunidad</Text>
              <Text style={styles.composerSubtitle}>
                Consejos, apoyo, experiencias o mensajes positivos.
              </Text>
            </View>
          </View>

          <TextInput
            style={styles.composerInput}
            placeholder="¿Qué quieres compartir hoy?"
            placeholderTextColor="rgba(233,213,255,0.45)"
            value={newPost}
            onChangeText={setNewPost}
            multiline={true}
            maxLength={280}
            textAlignVertical="top"
            blurOnSubmit={false}
            returnKeyType="default"
            autoCorrect={true}
            autoCapitalize="sentences"
          />

          <View style={styles.composerFooter}>
            <Text style={styles.counter}>{newPost.length}/280</Text>

            <TouchableOpacity
              style={[
                styles.publishButton,
                (!newPost.trim() || publishing) && styles.publishButtonDisabled,
              ]}
              onPress={handleCreatePost}
              disabled={!newPost.trim() || publishing}
              activeOpacity={0.85}
            >
              {publishing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color="#FFFFFF" />
                  <Text style={styles.publishButtonText}>Publicar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.feedTitleRow}>
          <Text style={styles.feedTitle}>Comunidad</Text>
          <Text style={styles.feedSubtitle}>{posts.length} publicaciones</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <LinearGradient
        colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']}
        style={styles.loadingContainer}
      >
        <ActivityIndicator color="#FFFFFF" size="large" />
        <Text style={styles.loadingText}>Cargando Aura Púrpura...</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
        >
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            renderItem={renderPost}
            ListHeaderComponent={renderHeader()}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Ionicons name="sparkles-outline" size={34} color="#E9D5FF" />
                <Text style={styles.emptyTitle}>Aún no hay publicaciones</Text>
                <Text style={styles.emptySubtitle}>
                  Sé la primera en compartir un mensaje con la comunidad.
                </Text>
              </View>
            }
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="none"
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#E9D5FF',
    marginTop: 14,
    fontSize: 15,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 120,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  topTextBox: {
    flex: 1,
    paddingRight: 12,
  },
  greeting: {
    color: 'rgba(233,213,255,0.78)',
    fontSize: 14,
    fontWeight: '700',
  },
  appTitle: {
    color: '#F5EFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileButton: {
    borderRadius: 20,
  },
  logoutButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBase: {
    backgroundColor: 'rgba(157,78,221,0.48)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 12,
  },
  avatarSubtle: {
    shadowColor: '#C77DFF',
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 5,
    marginRight: 0,
  },
  avatarBaseText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  accompanimentCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  accompanimentGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  accompanimentIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: 'rgba(157,78,221,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  accompanimentTextBox: {
    flex: 1,
  },
  accompanimentTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  accompanimentSubtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 3,
  },
  composerCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    marginBottom: 20,
  },
  composerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  composerTitleBox: {
    flex: 1,
  },
  composerTitle: {
    color: '#F5EFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  composerSubtitle: {
    color: 'rgba(233,213,255,0.65)',
    fontSize: 12,
    marginTop: 2,
  },
  composerInput: {
    minHeight: 90,
    maxHeight: 150,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
    fontSize: 15,
    lineHeight: 21,
  },
  composerFooter: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counter: {
    color: 'rgba(233,213,255,0.58)',
    fontSize: 12,
    fontWeight: '700',
  },
  publishButton: {
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#9D4EDD',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishButtonDisabled: {
    opacity: 0.45,
  },
  publishButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  feedTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  feedTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  feedSubtitle: {
    color: 'rgba(233,213,255,0.62)',
    fontSize: 12,
    fontWeight: '700',
  },
  postCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    marginBottom: 14,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  postHeaderText: {
    flex: 1,
  },
  authorName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  postDate: {
    color: 'rgba(233,213,255,0.55)',
    fontSize: 12,
    marginTop: 2,
  },
  postContent: {
    color: '#F5EFFF',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 14,
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.09)',
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  actionText: {
    color: '#E9D5FF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  emptyCard: {
    marginTop: 18,
    padding: 24,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 12,
  },
  emptySubtitle: {
    color: 'rgba(233,213,255,0.68)',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 6,
  },
});