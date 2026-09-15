const startButton = document.getElementById("startMeeting");
const stopButton = document.getElementById("stopMeeting");
const transcript = document.getElementById("transcript");
const meetingStatus = document.getElementById("meetingStatus");
const meetingDate = document.getElementById("meetingDate");
const meetingTime = document.getElementById("meetingTime");
const generateMinutesButton = document.getElementById("generateMinutes");
const minutes = document.getElementById("minutes");

let meetingStream = null;

const now = new Date();

meetingDate.textContent = now.toLocaleDateString();
meetingTime.textContent = now.toLocaleTimeString();

startButton.addEventListener("click", async function () {
    try {
        meetingStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        transcript.textContent =
    "Meeting audio captured. Meeting is now in progress...";

meetingStatus.textContent = "Meeting in Progress";
        startButton.disabled = true;
        stopButton.disabled = false;

        console.log("Meeting started:", meetingStream);

    } catch (error) {
        transcript.textContent =
            "Meeting capture was cancelled or unavailable.";

        console.error(error);
    }
});

stopButton.addEventListener("click", function () {
    if (meetingStream) {
        meetingStream.getTracks().forEach(function (track) {
            track.stop();
        });

        meetingStream = null;
    }

    transcript.textContent =
    "Meeting stopped. Ready for the next meeting.";

meetingStatus.textContent = "Meeting Stopped";
generateMinutesButton.disabled = false;
    startButton.disabled = false;
    stopButton.disabled = true;

    console.log("Meeting stopped.");
});
generateMinutesButton.addEventListener("click", function () {

    document.getElementById("minuteTitle").textContent =
        "Weekly Operations Meeting";

    document.getElementById("agenda").textContent =
        "Review weekly activities, project progress, and outstanding tasks.";

    document.getElementById("discussionPoints").textContent =
        "The team reviewed current project activities and discussed outstanding tasks.";

    document.getElementById("decisions").textContent =
        "The team agreed to complete pending activities before the next meeting.";

    document.getElementById("actionItems").textContent =
        "Complete outstanding project tasks and provide progress updates.";

    document.getElementById("responsibleOfficers").textContent =
        "Assigned team members";

    document.getElementById("deadlines").textContent =
        "Before the next weekly meeting.";

});