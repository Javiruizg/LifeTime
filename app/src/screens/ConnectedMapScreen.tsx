import { StyleSheet, View, Text } from 'react-native';

export default function ConnectedMapScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.text}>Connected</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0e1626',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
});
