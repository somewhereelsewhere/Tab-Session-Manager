import React, { Component } from "react";
import browser from "webextension-polyfill";
import log from "loglevel";
import { initSettings, getSettings, setSettings } from "src/settings/settings";
import { updateLogLevel, overWriteLogLevel } from "src/common/log";
import {
  getSessions,
  sendSessionSaveMessage,
  sendSessionRemoveMessage,
  sendSessionUpdateMessage
} from "../actions/controlSessions";
import openUrl from "../actions/openUrl";
import Header from "./Header";
import OptionsArea from "./OptionsArea";
import SessionsArea from "./SessionsArea";
import Notification from "./Notification";
import SaveArea from "./SaveArea";
import Menu from "./Menu";
import Error from "./Error";
import "../styles/PopupPage.scss";

const logDir = "popup/components/PopupPage";

export default class PopupPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      sessions: [],
      isInitSessions: false,
      removedSession: {},
      filterValue: "_displayAll",
      sortValue: "newest",
      isShowSearchBar: false,
      searchWord: "",
      notification: {
        message: "",
        type: "info",
        buttonLabel: "",
        onClick: () => {}
      },
      menu: {
        isOpen: false,
        x: 0,
        y: 0,
        items: <div />
      },
      error: {
        isError: false,
        type: ""
      }
    };

    this.init();
  }

  init = async () => {
    await initSettings();
    overWriteLogLevel();
    updateLogLevel();
    log.info(logDir, "init()");
    document.body.style.width = `${getSettings("popupWidth")}px`;
    document.body.style.height = `${getSettings("popupHeight")}px`;
    this.setState({
      sortValue: getSettings("sortValue") || "newest",
      isShowSearchBar: getSettings("isShowSearchBar")
    });

    const isInit = await browser.runtime.sendMessage({ message: "getInitState" });
    if (!isInit) this.setState({ error: { isError: true, type: "indexedDB" } });

    const keys = ["id", "name", "date", "tag", "tabsNumber", "windowsNumber"];
    const sessions = await getSessions(null, keys);
    this.setState({
      sessions: sessions,
      isInitSessions: true,
      filterValue: getSettings("filterValue") || "_displayAll"
    });
    browser.runtime.onMessage.addListener(this.changeSessions);

    if (getSettings("isShowUpdated")) {
      this.openNotification({
        message: browser.i18n.getMessage("NotificationOnUpdateLabel"),
        type: "info",
        duration: 20000,
        buttonLabel: browser.i18n.getMessage("seeMoreLabel"),
        onClick: () => openUrl("../options/index.html#information?action=updated")
      });
      setSettings("isShowUpdated", false);
    }
  };

  changeSessions = async request => {
    log.info(logDir, "changeSessions()", request);
    let sessions, newSession, index;
    switch (request.message) {
      case "saveSession":
        newSession = request.session;
        sessions = this.state.sessions.concat(newSession);
        break;
      case "updateSession":
        newSession = request.session;
        sessions = this.state.sessions;
        index = sessions.findIndex(session => session.id === newSession.id);
        if (index === -1) sessions = this.state.sessions.concat(newSession);
        else sessions.splice(index, 1, newSession);
        break;
      case "deleteSession":
        sessions = this.state.sessions;
        index = sessions.findIndex(session => session.id === request.id);
        if (index === -1) return;
        sessions.splice(index, 1);
        break;
      case "deleteAll":
        const keys = ["id", "name", "date", "tag", "tabsNumber", "windowsNumber"];
        sessions = await getSessions(null, keys);
        break;
    }
    this.setState({ sessions: sessions });
  };

  changeFilterValue = value => {
    log.info(logDir, "changeFilterValue()", value);
    this.setState({ filterValue: value });
    setSettings("filterValue", value);
  };

  changeSortValue = value => {
    log.info(logDir, "changeSortValue()", value);
    this.setState({ sortValue: value });
    setSettings("sortValue", value);
  };

  changeSearchWord = searchWord => {
    log.info(logDir, "changeSearchValue()", searchWord);
    this.setState({ searchWord: searchWord.trim() });
  };

  getSessionDetail = async id => {
    log.info(logDir, "getSessionDetail()", id);
    const session = await getSessions(id);
    const sessions = this.state.sessions;
    const index = sessions.findIndex(session => session.id === id);
    sessions.splice(index, 1, session);
    this.setState({ sessions: sessions });
  };

  saveSession = async (name, property) => {
    log.info(logDir, "saveSession()", name, property);
    try {
      await sendSessionSaveMessage(name, property);
      this.openNotification({
        message: browser.i18n.getMessage("sessionSavedLabel"),
        type: "success",
        duration: 2000
      });
    } catch (e) {
      this.openNotification({
        message: browser.i18n.getMessage("failedSaveSessionLabel"),
        type: "error"
      });
    }
  };

  removeSession = async id => {
    log.info(logDir, "removeSession()", id);
    const removedSession = await getSessions(id);
    this.setState({
      removedSession: removedSession
    });
    try {
      await sendSessionRemoveMessage(id);
      this.openNotification({
        message: browser.i18n.getMessage("sessionDeletedLabel"),
        type: "warn",
        buttonLabel: browser.i18n.getMessage("restoreSessionLabel"),
        onClick: this.restoreSession
      });
    } catch (e) {
      this.openNotification({
        message: browser.i18n.getMessage("failedDeleteSessionLabel"),
        type: "error"
      });
    }
  };

  restoreSession = () => {
    log.info(logDir, "restoreSession()");
    const removedSession = this.state.removedSession;
    if (removedSession.id == null) return;
    sendSessionUpdateMessage(removedSession);
    this.setState({
      removedSession: {}
    });
  };

  openNotification = notification => {
    log.info(logDir, "openNotification()", notification);
    this.setState({
      notification: {
        key: Date.now(),
        ...notification
      }
    });
  };

  openMenu = (x, y, itemsComponent) => {
    log.info(logDir, "openMenu()", itemsComponent);
    this.setState({
      menu: {
        isOpen: true,
        x: x,
        y: y,
        items: itemsComponent
      }
    });
  };

  closeMenu = () => {
    this.setState({
      menu: {
        isOpen: false,
        x: this.state.menu.x,
        y: this.state.menu.y,
        items: this.state.menu.items
      }
    });
  };

  componentDidUpdate() {
    if (this.state.error.isError) return;
    if (this.state.sessions === undefined || this.state.sessions === null) {
      browser.runtime.onMessage.removeListener(this.changeSessions);
      window.close();
      this.setState({ error: { isError: true, type: "noConnection" } });
    }
  }

  render() {
    return (
      <div id="popupPage" onClick={this.state.menu.isOpen ? this.closeMenu : null}>
        <Header />
        <OptionsArea
          sessions={this.state.sessions || []}
          filterValue={this.state.filterValue}
          sortValue={this.state.sortValue}
          isShowSearchBar={this.state.isShowSearchBar}
          changeSearchWord={this.changeSearchWord}
          changeFilter={this.changeFilterValue}
          changeSort={this.changeSortValue}
        />
        <Error error={this.state.error} />
        <SessionsArea
          sessions={this.state.sessions || []}
          filterValue={this.state.filterValue}
          sortValue={this.state.sortValue}
          searchWord={this.state.searchWord}
          removeSession={this.removeSession}
          getSessionDetail={this.getSessionDetail}
          openMenu={this.openMenu}
          isInitSessions={this.state.isInitSessions}
          error={this.state.error}
        />
        <Notification notification={this.state.notification} />
        <SaveArea openMenu={this.openMenu} saveSession={this.saveSession} />
        <Menu menu={this.state.menu} />
      </div>
    );
  }
}
