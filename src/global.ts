import { createSignal } from "solid-js"

const [recordingReply_, setRecordingReply_] = createSignal("")

export const recordingReply = recordingReply_
export const setRecordingReply = setRecordingReply_

const [recordingRoot_, setRecordingRoot_] = createSignal(false)

export const recordingRoot = recordingRoot_
export const setRecordingRoot = setRecordingRoot_
