import { clearStoredRecordingJobs } from './recordingJobs.js'

export async function signOutAccount(auth, userId) {
  const { error } = await auth.signOut()
  if (error) throw error
  if (userId) clearStoredRecordingJobs(userId)
}
